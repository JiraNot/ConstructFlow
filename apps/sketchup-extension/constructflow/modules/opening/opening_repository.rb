# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Opening
      class OpeningRepository
        DICTIONARY = 'constructflow.opening'
        DEFINITION_KEY = 'opening_definition'

        def read(entity)
          payload = Core::AttributeStore.new(entity).read_json(
            DEFINITION_KEY,
            nil,
            dictionary: DICTIONARY
          )
          payload ? OpeningDefinition.from_h(payload) : nil
        end

        def write(entity, definition)
          raise ArgumentError, 'OpeningDefinition required' unless definition.is_a?(OpeningDefinition)

          Core::AttributeStore.new(entity).write_json(
            DEFINITION_KEY,
            definition.to_h,
            dictionary: DICTIONARY
          )
          definition
        end
      end
    end
  end
end
