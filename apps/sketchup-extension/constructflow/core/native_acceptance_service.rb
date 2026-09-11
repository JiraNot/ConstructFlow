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
