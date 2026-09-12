# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Validators
        class RoomValidator
          def validate(definition)
            raise ArgumentError, 'RoomDefinition required' unless definition.is_a?(RoomDefinition)

            definition.errors.map do |message|
              { rule: 'architecture.room.validity', severity: 'error', message: message }.freeze
            end.freeze
          end
        end
      end
    end
  end
end
