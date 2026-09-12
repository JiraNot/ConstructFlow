# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Validators
        class CeilingValidator
          def validate(definition)
            raise ArgumentError, 'CeilingDefinition required' unless definition.is_a?(CeilingDefinition)

            definition.errors.map do |message|
              { rule: 'architecture.ceiling.validity', severity: 'error', message: message }.freeze
            end.freeze
          end
        end
      end
    end
  end
end
