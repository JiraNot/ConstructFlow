# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      class Repository
        DICTIONARY = 'constructflow.interior'
        CABINET_RUN_KEY = 'cabinet_run_definition'
        PART_SET_KEY = 'joinery_part_set_definition'

        def read_cabinet_run(entity)
          payload = read(entity, CABINET_RUN_KEY)
          payload ? CabinetRunDefinition.from_h(payload) : nil
        end

        def write_cabinet_run(entity, definition)
          raise ArgumentError, 'CabinetRunDefinition required' unless definition.is_a?(CabinetRunDefinition)
          write(entity, CABINET_RUN_KEY, definition.to_h)
          definition
        end

        def read_part_set(entity)
          payload = read(entity, PART_SET_KEY)
          payload ? JoineryPartSetDefinition.from_h(payload) : nil
        end

        def write_part_set(entity, definition)
          raise ArgumentError, 'JoineryPartSetDefinition required' unless definition.is_a?(JoineryPartSetDefinition)
          write(entity, PART_SET_KEY, definition.to_h)
          definition
        end

        def clear_part_set(entity)
          Core::AttributeStore.new(entity).delete(PART_SET_KEY, dictionary: DICTIONARY)
          true
        end

        private

        def read(entity, key)
          Core::AttributeStore.new(entity).read_json(key, nil, dictionary: DICTIONARY)
        end

        def write(entity, key, payload)
          Core::AttributeStore.new(entity).write_json(key, payload, dictionary: DICTIONARY)
        end
      end
    end
  end
end
