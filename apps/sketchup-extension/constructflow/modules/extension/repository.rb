# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      class Repository
        DICTIONARY = 'constructflow.extension'
        DEFINITION_KEY = 'extension_definition'

        def read(entity)
          payload = Core::AttributeStore.new(entity).read_json(
            DEFINITION_KEY, nil, dictionary: DICTIONARY
          )
          payload ? ExtensionDefinition.from_h(payload) : nil
        end

        def write(entity, definition)
          raise ArgumentError, 'ExtensionDefinition required' unless definition.is_a?(ExtensionDefinition)

          Core::AttributeStore.new(entity).write_json(
            DEFINITION_KEY, definition.to_h, dictionary: DICTIONARY
          )
          definition
        end
      end
    end
  end
end
