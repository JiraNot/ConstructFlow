# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Validators
        class FloorValidator
          def validate(definition)
            raise ArgumentError, 'FloorDefinition required' unless definition.is_a?(FloorDefinition)

            definition.errors.map do |message|
              { rule: 'architecture.floor.validity', severity: 'error', message: message }.freeze
            end.freeze
          end
        end
      end
    end
  end
end
