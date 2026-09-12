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

        NESTING_RESULT_KEY = 'nesting_result_definition'

        def read_nesting_result(entity)
          payload = read(entity, NESTING_RESULT_KEY)
          payload ? NestingResultDefinition.from_h(payload) : nil
        end

        def write_nesting_result(entity, definition)
          raise ArgumentError, 'NestingResultDefinition required' unless definition.is_a?(NestingResultDefinition)
          write(entity, NESTING_RESULT_KEY, definition.to_h)
          definition
        end

        COUNTERTOP_KEY = 'countertop_definition'
        WARDROBE_KEY = 'wardrobe_definition'
        FALSE_CEILING_KEY = 'false_ceiling_definition'
        WALL_PANELING_KEY = 'wall_paneling_definition'

        def read_countertop(entity)
          payload = read(entity, COUNTERTOP_KEY)
          payload ? CountertopDefinition.from_h(payload) : nil
        end

        def write_countertop(entity, definition)
          raise ArgumentError, 'CountertopDefinition required' unless definition.is_a?(CountertopDefinition)
          write(entity, COUNTERTOP_KEY, definition.to_h)
          definition
        end

        def read_wardrobe(entity)
          payload = read(entity, WARDROBE_KEY)
          payload ? WardrobeDefinition.from_h(payload) : nil
        end

        def write_wardrobe(entity, definition)
          raise ArgumentError, 'WardrobeDefinition required' unless definition.is_a?(WardrobeDefinition)
          write(entity, WARDROBE_KEY, definition.to_h)
          definition
        end

        def read_false_ceiling(entity)
          payload = read(entity, FALSE_CEILING_KEY)
          payload ? FalseCeilingDefinition.from_h(payload) : nil
        end

        def write_false_ceiling(entity, definition)
          raise ArgumentError, 'FalseCeilingDefinition required' unless definition.is_a?(FalseCeilingDefinition)
          write(entity, FALSE_CEILING_KEY, definition.to_h)
          definition
        end

        def read_wall_paneling(entity)
          payload = read(entity, WALL_PANELING_KEY)
          payload ? WallPanelingDefinition.from_h(payload) : nil
        end

        def write_wall_paneling(entity, definition)
          raise ArgumentError, 'WallPanelingDefinition required' unless definition.is_a?(WallPanelingDefinition)
          write(entity, WALL_PANELING_KEY, definition.to_h)
          definition
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
