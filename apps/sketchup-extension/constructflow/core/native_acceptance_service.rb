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
        end

        def capture_baseline(extension_id: nil)
          store.capture_baseline(
            runtime: @runtime,
            session_token: session_token,
            extension_id: extension_id
          )
        end

        def verify_reopen
          store.verify_reopen(runtime: @runtime, session_token: session_token)
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

        private

        def store
          model = @runtime.active_model
          raise ArgumentError, 'active SketchUp model required' unless model

          NativeAcceptanceEvidenceStore.new(model)
        end
      end
    end
  end
end
