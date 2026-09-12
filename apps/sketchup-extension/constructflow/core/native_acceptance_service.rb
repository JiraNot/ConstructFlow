# frozen_string_literal: true

require 'securerandom'

module JiraNot
  module ConstructFlow
    module Core
      class NativeAcceptanceService
        attr_reader :session_token

        def initialize(runtime:, session_token: SecureRandom.uuid)
          @runtime = runtime
          @session_token = session_token.to_s
          @acceptance_target = nil
        end

        def preflight(extension_id: nil)
          NativeAcceptancePreflight.new(runtime: @runtime).run(extension_id: extension_id)
        end

        def capture_baseline(extension_id: nil)
          result = store.capture_baseline(
            runtime: @runtime,
            session_token: current_session_marker,
            extension_id: extension_id
          )
          @acceptance_target = target_from_session(result)
          result
        end

        def verify_reopen
          result = store.verify_reopen(runtime: @runtime, session_token: current_session_marker)
          @acceptance_target ||= target_from_session(store.read)
          result
        end

        def verify_undo_redo
          model = @runtime.active_model
          raise ArgumentError, 'active SketchUp model required' unless model
          unless model.respond_to?(:undo) && model.respond_to?(:redo)
            raise ArgumentError, 'native model Undo/Redo API required'
          end

          session = store.read
          baseline = session['baseline']
          raise ArgumentError, 'native acceptance baseline has not been captured' unless baseline.is_a?(Hash)

          current = store.send(:snapshot_for, @runtime)
          if current == baseline
            return {
              'status' => 'requires_probe',
              'passed' => false,
              'message' => 'perform one semantic geometry edit after baseline capture before verifying Undo/Redo',
              'differences' => {}
            }.freeze
          end

          did_undo = false
          did_redo = false
          begin
            model.undo
            did_undo = true
            undone = store.send(:snapshot_for, @runtime)
            model.redo
            did_redo = true
            redone = store.send(:snapshot_for, @runtime)
          ensure
            model.redo if did_undo && !did_redo
          end
          undo_differences = store.send(:snapshot_differences, baseline, undone)
          redo_differences = store.send(:snapshot_differences, current, redone)
          passed = undo_differences.empty? && redo_differences.empty?
          result = {
            'status' => passed ? 'passed' : 'failed',
            'passed' => passed,
            'message' => passed ? 'Undo restored semantic geometry and Redo restored the edited state' : 'Undo/Redo changed semantic geometry or metadata unexpectedly',
            'differences' => { 'undo' => undo_differences, 'redo' => redo_differences }
          }.freeze
          store.record_checkpoint(
            checkpoint_id: 'undo_redo_semantic_geometry',
            status: result['status'],
            notes: result['message'],
            evidence: {
              'evidence_source' => 'native_runtime_undo_redo',
              'baseline_fingerprint' => baseline['smart_object_states'],
              'current_fingerprint' => current['smart_object_states'],
              'undone_fingerprint' => undone['smart_object_states'],
              'redone_fingerprint' => redone['smart_object_states'],
              'differences' => result['differences']
            }
          )
          result
        end

        def record_checkpoint(checkpoint_id:, status:, notes: '', evidence: {})
          store.record_checkpoint(
            checkpoint_id: checkpoint_id,
            status: status,
            notes: notes,
            evidence: evidence
          )
        end

        def summary
          store.summary
        end

        # Read-only access for native runtime evidence collectors. The returned
        # value is model-local acceptance evidence, not domain semantic state.
        def session
          store.read
        end

        # Kept in memory so a New Model transition can temporarily switch
        # Runtime away from the acceptance model and still know which saved
        # project must be reopened to satisfy the observer checkpoint.
        def acceptance_target
          return @acceptance_target if @acceptance_target

          @acceptance_target = target_from_session(store.read)
        rescue StandardError
          nil
        end

        private

        def target_from_session(session)
          baseline = session && session['baseline']
          return nil unless baseline.is_a?(Hash)

          model_path = baseline['model_path'].to_s
          project_id = baseline['project_id'].to_s
          return nil if model_path.empty? || project_id.empty?

          {
            'model_path' => model_path,
            'project_id' => project_id,
            'baseline_fingerprint' => session['baseline_fingerprint'].to_s
          }.freeze
        end

        def current_session_marker
          model = @runtime.active_model
          raise ArgumentError, 'active SketchUp model required' unless model

          "#{session_token}:#{model.object_id}"
        end

        def store
          model = @runtime.active_model
          raise ArgumentError, 'active SketchUp model required' unless model

          NativeAcceptanceEvidenceStore.new(model)
        end

      end
    end
  end
end
