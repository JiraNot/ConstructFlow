# frozen_string_literal: true

require_relative 'entity_attribute_adapter'
require_relative 'model_transaction_adapter'

module JiraNot
  module ConstructFlow
    module Core
      module Host
        # Unified Host provider for SketchUp runtime operations.
        # Provides access to model, persistence, transaction, and observer services
        # behind a cohesive interface.
        class SketchUpHost
          attr_reader :active_model

          def initialize(active_model = nil)
            @active_model = active_model
          end

          def attach_model(model)
            @active_model = model
          end

          def attribute_adapter(entity)
            EntityAttributeAdapter.new(entity)
          end

          def transaction_adapter(model = @active_model)
            ModelTransactionAdapter.new(model)
          end

          def add_app_observer(observer)
            return false unless defined?(::Sketchup) && ::Sketchup.respond_to?(:add_observer)

            ::Sketchup.add_observer(observer)
          end

          def add_model_observer(model, observer)
            return false unless model&.respond_to?(:add_observer)

            model.add_observer(observer)
          end
        end
      end
    end
  end
end
