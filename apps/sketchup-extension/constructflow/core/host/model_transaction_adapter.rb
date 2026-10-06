# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module Host
        # Host adapter encapsulating SketchUp model transaction lifecycle operations
        # (start_operation, commit_operation, abort_operation).
        class ModelTransactionAdapter
          attr_reader :model

          def initialize(model)
            @model = model
          end

          def start_operation(name, transparent: false)
            return false unless @model.respond_to?(:start_operation)

            @model.start_operation(name.to_s, true, false, !!transparent)
          end

          def commit_operation
            return false unless @model.respond_to?(:commit_operation)

            @model.commit_operation
          end

          def abort_operation
            return false unless @model.respond_to?(:abort_operation)

            @model.abort_operation
          end
        end
      end
    end
  end
end
