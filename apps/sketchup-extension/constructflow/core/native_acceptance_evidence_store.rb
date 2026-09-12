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
        SCENE_PRESENTATION_DICTIONARY = 'constructflow.scene_presentation'
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
          presentation_differences = {}
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
                     presentation_differences = presentation_snapshot_differences(baseline, current)
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
            'differences' => result['differences'],
            'presentation_differences' => presentation_differences
          }
          unless same_session
            session = record_checkpoint_in(
              session,
              checkpoint_id: 'save_reopen_identity',
              status: result['status'],
              notes: result['message'],
              evidence: evidence
            )
            session = record_scene_tag_checkpoint(session, baseline, current, presentation_differences)
            write(session)
          end
          result.merge('presentation_differences' => presentation_differences, 'evidence' => evidence).freeze
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

        def record_scene_tag_checkpoint(session, baseline, current, differences)
          return session unless presentation_baseline_ready?(baseline)

          same_project = baseline['project_id'].to_s == current['project_id'].to_s &&
                         baseline['model_path'].to_s == current['model_path'].to_s
          passed = same_project && differences.empty?
          message = if passed
                      'managed scene camera/presentation state and baseline tag state survived reopen'
                    elsif !same_project
                      'scene/tag persistence cannot pass because the reopened project identity differs from baseline'
                    else
                      'managed scene/tag presentation differs from the captured native baseline'
                    end
          record_checkpoint_in(
            session,
            checkpoint_id: 'scene_tag_persistence',
            status: passed ? 'passed' : 'failed',
            notes: message,
            evidence: {
              'evidence_source' => 'native_reopen_snapshot',
              'baseline_fingerprint' => fingerprint(presentation_subset(baseline)),
              'current_fingerprint' => fingerprint(presentation_subset(current)),
              'differences' => differences
            }
          )
        end

        def presentation_baseline_ready?(snapshot)
          scenes = Array(snapshot['managed_scene_states'])
          tags = Array(snapshot['tag_states'])
          !scenes.empty? && tags.any? { |tag| tag['name'].to_s.start_with?('CF-') }
        end

        def snapshot_for(runtime)
          model = runtime.active_model
          pages = model && model.respond_to?(:pages) ? model.pages : nil
          layers = model && model.respond_to?(:layers) ? model.layers : nil
          {
            'project_id' => runtime.project&.project_id.to_s,
            'model_path' => model_path(model),
            'smart_object_ids' => runtime.smart_objects.all.map { |object| object.id.to_s }.reject(&:empty?).uniq.sort,
            'smart_object_states' => smart_object_states(runtime),
            'scene_names' => collection_names(pages),
            'managed_tag_names' => collection_names(layers).select { |name| name.start_with?('CF-') }.sort,
            'managed_scene_states' => managed_scene_states(pages),
            'tag_states' => tag_states(layers)
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
          compare_set(differences, 'smart_object_states', baseline, current, exact: true)
          compare_set(differences, 'scene_names', baseline, current, exact: false)
          compare_set(differences, 'managed_tag_names', baseline, current, exact: false)
          differences
        end

        def presentation_snapshot_differences(baseline, current)
          differences = {}
          return differences unless presentation_baseline_ready?(baseline)

          compare_named_states(differences, 'managed_scene_states', baseline, current)
          compare_named_states(differences, 'tag_states', baseline, current)
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

        def compare_named_states(differences, key, baseline, current)
          expected = state_index(baseline[key])
          actual = state_index(current[key])
          missing = expected.keys - actual.keys
          changed = (expected.keys & actual.keys).each_with_object({}) do |name, values|
            next if expected[name] == actual[name]

            values[name] = { 'expected' => expected[name], 'actual' => actual[name] }
          end
          return if missing.empty? && changed.empty?

          differences[key] = { 'missing' => missing.sort, 'changed' => changed }
        end

        def state_index(values)
          Array(values).each_with_object({}) do |value, result|
            next unless value.is_a?(Hash)
            name = value['name'].to_s
            next if name.empty?

            result[name] = value
          end
        end

        def presentation_subset(snapshot)
          {
            'managed_scene_states' => Array(snapshot['managed_scene_states']),
            'tag_states' => Array(snapshot['tag_states'])
          }
        end

        def managed_scene_states(collection)
          enumerable_values(collection).filter_map do |page|
            name = item_name(page)
            active_tag = read_page_attribute(page, 'active_drawing_tag')
            next unless name.start_with?('ConstructFlow -') || !active_tag.empty?

            {
              'name' => name,
              'use_camera' => boolean_value(page, :use_camera?),
              'camera' => camera_state(page.respond_to?(:camera) ? page.camera : nil),
              'presentation' => {
                'active_drawing_tag' => active_tag,
                'managed_drawing_tags' => read_page_attribute(page, 'managed_drawing_tags'),
                'managed_style_tags' => read_page_attribute(page, 'managed_style_tags')
              }
            }.freeze
          end.sort_by { |state| state['name'] }.freeze
        end

        def tag_states(collection)
          enumerable_values(collection).filter_map do |tag|
            name = item_name(tag)
            next if name.empty?

            {
              'name' => name,
              'visible' => boolean_value(tag, :visible?),
              'color' => color_state(tag.respond_to?(:color) ? tag.color : nil),
              'line_style' => line_style_name(tag.respond_to?(:line_style) ? tag.line_style : nil)
            }.freeze
          end.sort_by { |state| state['name'] }.freeze
        end

        def camera_state(camera)
          return {} unless camera

          state = {}
          state['perspective'] = boolean_value(camera, :perspective?) if camera.respond_to?(:perspective?)
          state['eye'] = point_state(camera.eye) if camera.respond_to?(:eye)
          state['target'] = point_state(camera.target) if camera.respond_to?(:target)
          state['up'] = point_state(camera.up) if camera.respond_to?(:up)
          state['height'] = numeric_state(camera.height) if camera.respond_to?(:height)
          state.freeze
        rescue StandardError
          {}.freeze
        end

        def point_state(value)
          values = if value.respond_to?(:to_a)
                     value.to_a
                   elsif value.respond_to?(:x) && value.respond_to?(:y) && value.respond_to?(:z)
                     [value.x, value.y, value.z]
                   else
                     []
                   end
          values.first(3).map { |item| numeric_state(item) }.freeze
        rescue StandardError
          [].freeze
        end

        def color_state(color)
          return [] unless color

          values = if color.respond_to?(:to_a)
                     color.to_a
                   elsif color.respond_to?(:red) && color.respond_to?(:green) && color.respond_to?(:blue)
                     [color.red, color.green, color.blue]
                   else
                     []
                   end
          values.map { |item| numeric_state(item) }.freeze
        rescue StandardError
          [].freeze
        end

        def line_style_name(line_style)
          return '' if line_style.nil?
          return line_style.name.to_s if line_style.respond_to?(:name)

          line_style.to_s
        rescue StandardError
          ''
        end

        def read_page_attribute(page, key)
          return '' unless page.respond_to?(:get_attribute)

          page.get_attribute(SCENE_PRESENTATION_DICTIONARY, key, '').to_s
        rescue StandardError
          ''
        end

        def boolean_value(object, method_name)
          return nil unless object.respond_to?(method_name)

          !!object.public_send(method_name)
        rescue StandardError
          nil
        end

        def numeric_state(value)
          Float(value).round(6)
        rescue StandardError
          value.to_s
        end

        def model_path(model)
          return '' unless model && model.respond_to?(:path)
          model.path.to_s
        end

        def smart_object_states(runtime)
          Array(runtime.smart_objects.all).filter_map do |object|
            state = if object.respond_to?(:to_h)
                      object.to_h.each_with_object({}) do |(key, value), values|
                        values[key.to_s] = value
                      end
                    else
                      { 'id' => object.respond_to?(:id) ? object.id.to_s : '' }
                    end
            state.delete(:created_at)
            state.delete('created_at')
            state.delete(:updated_at)
            state.delete('updated_at')
            state['domain_attributes'] = attribute_dictionaries(object.entity) if object.respond_to?(:entity)
            state['id'] = object.id.to_s if object.respond_to?(:id)
            state
          end.sort_by { |state| state['id'].to_s }
        end

        def attribute_dictionaries(entity)
          dictionaries = entity.respond_to?(:attribute_dictionaries) ? entity.attribute_dictionaries : nil
          return {} unless dictionaries

          enumerable_values(dictionaries).each_with_object({}) do |dictionary, result|
            name = item_name(dictionary)
            next if name.empty?

            values = if dictionary.respond_to?(:each_pair)
                       dictionary.each_pair.each_with_object({}) do |(key, value), hash|
                         hash[key.to_s] = scrub_volatile(value)
                       end
                     else
                       {}
                     end
            result[name] = values
          end
        rescue StandardError
          {}
        end

        def scrub_volatile(value)
          case value
          when Hash
            value.each_with_object({}) do |(key, item), result|
              next if %w[created_at updated_at].include?(key.to_s)

              result[key.to_s] = scrub_volatile(item)
            end
          when Array
            value.map { |item| scrub_volatile(item) }
          else
            value
          end
        end

        def collection_names(collection)
          enumerable_values(collection).map { |item| item_name(item) }.reject(&:empty?).uniq.sort
        end

        def enumerable_values(collection)
          return [] if collection.nil?
          return collection.to_a if collection.respond_to?(:to_a)

          values = []
          collection.each { |item| values << item } if collection.respond_to?(:each)
          values
        rescue StandardError
          []
        end

        def item_name(item)
          (item.respond_to?(:name) ? item.name : item.to_s).to_s
        rescue StandardError
          ''
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
