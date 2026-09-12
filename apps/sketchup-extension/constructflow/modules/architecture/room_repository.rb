# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class RoomRepository
        DICTIONARY = 'constructflow.architecture'
        KEY = 'room_definition'

        def read(entity)
          payload = Core::AttributeStore.new(entity).read_json(KEY, nil, dictionary: DICTIONARY)
          payload ? RoomDefinition.from_h(payload) : nil
        end

        def write(entity, definition)
          raise ArgumentError, 'RoomDefinition required' unless definition.is_a?(RoomDefinition)

          Core::AttributeStore.new(entity).write_json(KEY, definition.to_h, dictionary: DICTIONARY)
          definition
        end
      end
    end
  end
end
