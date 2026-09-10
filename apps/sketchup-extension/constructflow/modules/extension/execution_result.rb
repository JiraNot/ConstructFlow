# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      ExecutionStepResult = Struct.new(
        :domain, :status, :command_name, :created_object_ids, :updated_object_ids,
        :removed_object_ids, :warnings, :errors, keyword_init: true
      ) do
        def success?
          status.to_sym == :success
        end

        def skipped?
          status.to_sym == :skipped
        end

        def failed?
          status.to_sym == :failed
        end

        def to_h
          {
            domain: domain.to_s,
            status: status.to_s,
            command_name: command_name,
            created_object_ids: Array(created_object_ids),
            updated_object_ids: Array(updated_object_ids),
            removed_object_ids: Array(removed_object_ids),
            warnings: Array(warnings),
            errors: Array(errors)
          }
        end
      end

      ExecutionResult = Struct.new(:extension_id, :status, :steps, :errors, keyword_init: true) do
        def success?
          status.to_sym == :success
        end

        def partial?
          status.to_sym == :partial
        end

        def failed?
          status.to_sym == :failed
        end

        def to_h
          {
            extension_id: extension_id,
            status: status.to_s,
            steps: Array(steps).map(&:to_h),
            errors: Array(errors)
          }
        end
      end
    end
  end
end
