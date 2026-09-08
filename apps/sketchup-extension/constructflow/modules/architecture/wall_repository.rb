# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class WallRepository
        DICTIONARY = 'constructflow.architecture'
        WALL_KEY = 'wall_definition'

        def read(entity)
          store = Core::AttributeStore.new(entity)
          payload = store.read_json(WALL_KEY, nil, dictionary: DICTIONARY)
          payload ? WallDefinition.from_h(payload) : nil
        end

        def write(entity, definition)
          raise ArgumentError, 'WallDefinition required' unless definition.is_a?(WallDefinition)

          Core::AttributeStore.new(entity).write_json(
            WALL_KEY,
            definition.to_h,
            dictionary: DICTIONARY
          )
          definition
        end
      end
    end
  end
end
