# frozen_string_literal: true

require 'digest'
require 'json'
require 'time'

module JiraNot
  module ConstructFlow
    module Core
      class NativeAcceptanceEvidenceStore
        DICTIONARY = 'constructflow.native_acceptance'
        KEY = 'session_v1'
        SCHEMA_VERSION = 1
        REQUIRED_CHECKPOINTS = %w[
          save_reopen_identity
          undo_redo_semantic_geometry
          native_copy_identity
          observer_new_open
          migration_fixture
          interactive_tools
          scene_tag_persistence
          layout_pdf_export
        ].freeze
        CHECKPOINT_STATUSES = %w[pending passed failed skipped].freeze

        def initialize(model)
          @model = model
          @store = AttributeStore.new(model)
        end

        def read
          normalize(@store.read_json(KEY, nil, dictionary: DICTIONARY))
        end

        def capture_baseline(runtime:, session_token:, extension_id: nil)
          snapshot = snapshot_for(runtime)
          raise ArgumentError, 'save the SketchUp model before capturing native acceptance baseline' if snapshot['model_path'].empty?

          session = default_session.merge(
            'captured_at' => Time.now.utc.iso8601,
            'extension_id' => extension_id.to_s,
            'capture_session_token' => session_token.to_s,
            'baseline' => snapshot,
            'baseline_fingerprint' => fingerprint(snapshot)
          )
          write(session)
        end

        def verify_reopen(runtime:, session_token:)
          session = read
          baseline = session['baseline']
          raise ArgumentError, 'native acceptance baseline has not been captured' unless baseline.is_a?(Hash)

          current = snapshot_for(runtime)
          same_session = session['capture_session_token'].to_s == session_token.to_s
          result = if same_session
                     {
                       'status' => 'requires_reopen',
                       'passed' => false,
                       'message' => 'close/reopen the saved model (or restart SketchUp) before verifying persistence',
                       'differences' => {}
                     }
                   else
                     differences = snapshot_differences(baseline, current)
                     passed = differences.empty?
                     {
                       'status' => passed ? 'passed' : 'failed',
                       'passed' => passed,
                       'message' => passed ? 'saved-model semantic identity and managed drawing state survived reopen' : 'reopened model differs from the captured baseline',
                       'differences' => differences
                     }
                   end

          evidence = {
            'verified_at' => Time.now.utc.iso8601,
            'baseline_fingerprint' => session['baseline_fingerprint'],
            'current_fingerprint' => fingerprint(current),
            'current' => current,
            'differences' => result['differences']
          }
          unless same_session
            session = record_checkpoint_in(
              session,
              checkpoint_id: 'save_reopen_identity',
              status: result['status'],
              notes: result['message'],
              evidence: evidence
            )
            write(session)
          end
          result.merge('evidence' => evidence).freeze
        end

        def record_checkpoint(checkpoint_id:, status:, notes: '', evidence: {})
          session = record_checkpoint_in(
            read,
            checkpoint_id: checkpoint_id,
            status: status,
            notes: notes,
            evidence: evidence
          )
          write(session)
        end

        def summary
          session = read
          checkpoints = session['checkpoints']
          passed = REQUIRED_CHECKPOINTS.select { |id| checkpoints.dig(id, 'status') == 'passed' }
          failed = REQUIRED_CHECKPOINTS.select { |id| checkpoints.dig(id, 'status') == 'failed' }
          pending = REQUIRED_CHECKPOINTS - passed - failed
          {
            'schema_version' => SCHEMA_VERSION,
            'captured_at' => session['captured_at'],
            'extension_id' => session['extension_id'],
            'baseline_fingerprint' => session['baseline_fingerprint'],
            'complete' => passed.length == REQUIRED_CHECKPOINTS.length,
            'passed' => passed.freeze,
            'failed' => failed.freeze,
            'pending' => pending.freeze,
            'checkpoints' => checkpoints
          }.freeze
        end

        private

        def write(session)
          normalized = normalize(session)
          @store.write_json(KEY, normalized, dictionary: DICTIONARY)
          normalized.freeze
        end

        def default_session
          {
            'schema_version' => SCHEMA_VERSION,
            'captured_at' => nil,
            'extension_id' => '',
            'capture_session_token' => '',
            'baseline' => nil,
            'baseline_fingerprint' => nil,
            'checkpoints' => REQUIRED_CHECKPOINTS.each_with_object({}) do |checkpoint_id, values|
              values[checkpoint_id] = {
                'status' => 'pending',
                'notes' => '',
                'recorded_at' => nil,
                'evidence' => {}
              }
            end
          }
        end

        def normalize(value)
          session = default_session
          return session if value.nil? || !value.is_a?(Hash)

          session['captured_at'] = value['captured_at']
          session['extension_id'] = value['extension_id'].to_s
          session['capture_session_token'] = value['capture_session_token'].to_s
          session['baseline'] = value['baseline'] if value['baseline'].is_a?(Hash)
          session['baseline_fingerprint'] = value['baseline_fingerprint']
          incoming = value['checkpoints'].is_a?(Hash) ? value['checkpoints'] : {}
          REQUIRED_CHECKPOINTS.each do |checkpoint_id|
            record = incoming[checkpoint_id]
            next unless record.is_a?(Hash)

            status = record['status'].to_s
            status = 'pending' unless CHECKPOINT_STATUSES.include?(status)
            session['checkpoints'][checkpoint_id] = {
              'status' => status,
              'notes' => record['notes'].to_s,
              'recorded_at' => record['recorded_at'],
              'evidence' => record['evidence'].is_a?(Hash) ? record['evidence'] : {}
            }
          end
          session
        end

        def record_checkpoint_in(session, checkpoint_id:, status:, notes:, evidence:)
          id = checkpoint_id.to_s
          state = status.to_s
          raise ArgumentError, "unknown native acceptance checkpoint: #{id}" unless REQUIRED_CHECKPOINTS.include?(id)
          raise ArgumentError, "invalid native acceptance checkpoint status: #{state}" unless CHECKPOINT_STATUSES.include?(state)
          raise ArgumentError, 'checkpoint evidence must be a Hash' unless evidence.is_a?(Hash)

          updated = normalize(session)
          updated['checkpoints'][id] = {
            'status' => state,
            'notes' => notes.to_s,
            'recorded_at' => Time.now.utc.iso8601,
            'evidence' => deep_stringify(evidence)
          }
          updated
        end

        def snapshot_for(runtime)
          model = runtime.active_model
          {
            'project_id' => runtime.project&.project_id.to_s,
            'model_path' => model_path(model),
            'smart_object_ids' => runtime.smart_objects.all.map { |object| object.id.to_s }.reject(&:empty?).uniq.sort,
            'scene_names' => collection_names(model.respond_to?(:pages) ? model.pages : nil),
            'managed_tag_names' => collection_names(model.respond_to?(:layers) ? model.layers : nil).select do |name|
              name.start_with?('CF-')
            end.sort
          }.freeze
        end

        def snapshot_differences(baseline, current)
          differences = {}
          if baseline['project_id'].to_s != current['project_id'].to_s
            differences['project_id'] = { 'expected' => baseline['project_id'], 'actual' => current['project_id'] }
          end
          if baseline['model_path'].to_s != current['model_path'].to_s
            differences['model_path'] = { 'expected' => baseline['model_path'], 'actual' => current['model_path'] }
          end
          compare_set(differences, 'smart_object_ids', baseline, current, exact: true)
          compare_set(differences, 'scene_names', baseline, current, exact: false)
          compare_set(differences, 'managed_tag_names', baseline, current, exact: false)
          differences
        end

        def compare_set(differences, key, baseline, current, exact:)
          expected = Array(baseline[key]).map(&:to_s).uniq.sort
          actual = Array(current[key]).map(&:to_s).uniq.sort
          missing = expected - actual
          extra = exact ? actual - expected : []
          return if missing.empty? && extra.empty?

          differences[key] = { 'missing' => missing, 'extra' => extra }
        end

        def model_path(model)
          return '' unless model && model.respond_to?(:path)
          model.path.to_s
        end

        def collection_names(collection)
          return [] if collection.nil?

          values = []
          collection.each do |item|
            name = item.respond_to?(:name) ? item.name : item.to_s
            value = name.to_s
            values << value unless value.empty?
          end
          values.uniq.sort
        end

        def fingerprint(value)
          Digest::SHA256.hexdigest(JSON.generate(deep_sort(value)))
        end

        def deep_sort(value)
          case value
          when Hash
            value.keys.map(&:to_s).sort.each_with_object({}) do |key, result|
              original_key = value.key?(key) ? key : value.keys.find { |candidate| candidate.to_s == key }
              result[key] = deep_sort(value[original_key])
            end
          when Array
            value.map { |item| deep_sort(item) }
          else
            value
          end
        end

        def deep_stringify(value)
          case value
          when Hash
            value.each_with_object({}) { |(key, item), result| result[key.to_s] = deep_stringify(item) }
          when Array
            value.map { |item| deep_stringify(item) }
          else
            value
          end
        end
      end
    end
  end
end
