# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      class Repository
        DICTIONARY = 'constructflow.surface'
        SURFACE_KEY = 'surface_definition'
        PATTERN_KEY = 'pattern_definition'
        LAYOUT_KEY = 'paving_layout_definition'
        BORDER_KEY = 'border_definition'
        PARKING_KEY = 'parking_layout_definition'
        SLOPE_KEY = 'slope_definition'
        ASSEMBLY_KEY = 'surface_assembly_definition'
        CONTROL_JOINTS_KEY = 'control_joints'
        TREE_PITS_KEY = 'tree_pits'
        PATH_KEY = 'path_surface_definition'

        def read_surface(entity)
          payload = read(entity, SURFACE_KEY)
          payload ? SurfaceDefinition.from_h(payload) : nil
        end

        def write_surface(entity, definition)
          raise ArgumentError, 'SurfaceDefinition required' unless definition.is_a?(SurfaceDefinition)
          write(entity, SURFACE_KEY, definition.to_h)
          definition
        end

        def read_pattern(entity)
          payload = read(entity, PATTERN_KEY)
          payload ? PatternDefinition.from_h(payload) : nil
        end

        def write_pattern(entity, definition)
          raise ArgumentError, 'PatternDefinition required' unless definition.is_a?(PatternDefinition)
          write(entity, PATTERN_KEY, definition.to_h)
          definition
        end

        def read_layout(entity)
          payload = read(entity, LAYOUT_KEY)
          payload ? PavingLayoutDefinition.from_h(payload) : nil
        end

        def write_layout(entity, definition)
          raise ArgumentError, 'PavingLayoutDefinition required' unless definition.is_a?(PavingLayoutDefinition)
          write(entity, LAYOUT_KEY, definition.to_h)
          definition
        end

        def clear_layout(entity)
          Core::AttributeStore.new(entity).delete(LAYOUT_KEY, dictionary: DICTIONARY)
          true
        end

        def read_border(entity)
          payload = read(entity, BORDER_KEY)
          payload ? BorderDefinition.from_h(payload) : nil
        end

        def write_border(entity, definition)
          raise ArgumentError, 'BorderDefinition required' unless definition.is_a?(BorderDefinition)
          write(entity, BORDER_KEY, definition.to_h)
          definition
        end

        def read_parking(entity)
          payload = read(entity, PARKING_KEY)
          payload ? ParkingLayoutDefinition.from_h(payload) : nil
        end

        def write_parking(entity, definition)
          raise ArgumentError, 'ParkingLayoutDefinition required' unless definition.is_a?(ParkingLayoutDefinition)
          write(entity, PARKING_KEY, definition.to_h)
          definition
        end

        def read_slope(entity)
          payload = read(entity, SLOPE_KEY)
          payload ? SlopeDefinition.from_h(payload) : nil
        end

        def write_slope(entity, definition)
          raise ArgumentError, 'SlopeDefinition required' unless definition.is_a?(SlopeDefinition)
          write(entity, SLOPE_KEY, definition.to_h)
          definition
        end

        def read_assembly(entity)
          payload = read(entity, ASSEMBLY_KEY)
          payload ? SurfaceAssemblyDefinition.from_h(payload) : nil
        end

        def write_assembly(entity, definition)
          raise ArgumentError, 'SurfaceAssemblyDefinition required' unless definition.is_a?(SurfaceAssemblyDefinition)
          write(entity, ASSEMBLY_KEY, definition.to_h)
          definition
        end

        def read_control_joints(entity)
          payload = read(entity, CONTROL_JOINTS_KEY)
          return [] unless payload.is_a?(Array)

          payload.filter_map { |item| ControlJointDefinition.from_h(item) }
        end

        def write_control_joints(entity, definitions)
          items = Array(definitions).map(&:to_h)
          write(entity, CONTROL_JOINTS_KEY, items)
          definitions
        end

        def read_tree_pits(entity)
          payload = read(entity, TREE_PITS_KEY)
          return [] unless payload.is_a?(Array)

          payload.filter_map { |item| TreePitDefinition.from_h(item) }
        end

        def write_tree_pits(entity, definitions)
          items = Array(definitions).map(&:to_h)
          write(entity, TREE_PITS_KEY, items)
          definitions
        end

        def read_path(entity)
          payload = read(entity, PATH_KEY)
          payload ? PathSurfaceDefinition.from_h(payload) : nil
        end

        def write_path(entity, definition)
          raise ArgumentError, 'PathSurfaceDefinition required' unless definition.is_a?(PathSurfaceDefinition)
          write(entity, PATH_KEY, definition.to_h)
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
