# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class WallRepository
        DICTIONARY = 'constructflow.architecture'
        WALL_KEY = 'wall_definition'
        HOST_OPENINGS_KEY = 'host_openings'

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

        def host_openings(entity)
          Array(
            Core::AttributeStore.new(entity).read_json(
              HOST_OPENINGS_KEY,
              [],
              dictionary: DICTIONARY
            )
          )
        end

        def write_host_openings(entity, openings)
          normalized = Array(openings).map do |opening|
            opening.each_with_object({}) { |(key, value), result| result[key.to_s] = value }
          end
          Core::AttributeStore.new(entity).write_json(
            HOST_OPENINGS_KEY,
            normalized,
            dictionary: DICTIONARY
          )
          normalized
        end
      end
    end
  end
end
