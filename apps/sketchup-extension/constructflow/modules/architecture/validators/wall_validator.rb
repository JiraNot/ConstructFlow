# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Validators
        class WallValidator
          def validate(definition)
            raise ArgumentError, 'WallDefinition required' unless definition.is_a?(WallDefinition)

            definition.errors.map do |message|
              {
                rule: 'architecture.wall.validity',
                severity: 'error',
                message: message
              }.freeze
            end.freeze
          end
        end
      end
    end
  end
end
