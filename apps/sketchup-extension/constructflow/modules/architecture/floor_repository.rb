# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class FloorRepository
        DICTIONARY = 'constructflow.architecture'
        KEY = 'floor_definition'

        def read(entity)
          payload = Core::AttributeStore.new(entity).read_json(KEY, nil, dictionary: DICTIONARY)
          payload ? FloorDefinition.from_h(payload) : nil
        end

        def write(entity, definition)
          raise ArgumentError, 'FloorDefinition required' unless definition.is_a?(FloorDefinition)

          Core::AttributeStore.new(entity).write_json(KEY, definition.to_h, dictionary: DICTIONARY)
          definition
        end
      end
    end
  end
end
