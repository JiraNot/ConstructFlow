# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      class Geometry
        def create_surface_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Surface'
          rebuild_surface!(group, definition)
          group
        end

        def rebuild_surface!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          outer = definition.outer_boundary_mm.map { |value| point(value) }
          face = entities.add_face(outer)
          raise 'failed to create surface face' unless face

          definition.holes_mm.each do |loop|
            hole_face = entities.add_face(loop.map { |value| point(value) })
            hole_face.erase! if hole_face && hole_face.valid?
          end
          group
        end

        def create_pattern_group(model, surface_definition:, pattern_definition:)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Paving Pattern'
          rebuild_pattern!(group, surface_definition: surface_definition, pattern_definition: pattern_definition)
          group
        end

        def rebuild_pattern!(group, surface_definition:, pattern_definition:)
          entities = group.entities
          entities.clear!
          origin = pattern_definition.origin_mm
          basis = pattern_definition.basis
          length = [surface_definition.bounding_box_mm[:max][0] - surface_definition.bounding_box_mm[:min][0],
                    surface_definition.bounding_box_mm[:max][1] - surface_definition.bounding_box_mm[:min][1]].max
          length = pattern_definition.module_mm.max * 2.0 if length <= 0
          primary_end = [origin[0] + (basis[:primary][0] * length), origin[1] + (basis[:primary][1] * length), origin[2]]
          secondary_end = [origin[0] + (basis[:secondary][0] * length), origin[1] + (basis[:secondary][1] * length), origin[2]]
          entities.add_line(point(origin), point(primary_end))
          entities.add_line(point(origin), point(secondary_end))
          group
        end

        def rebuild_locked_layout!(group, layout_definition:)
          raise ArgumentError, layout_definition.errors.join('; ') unless layout_definition.valid?

          entities = group.entities
          entities.clear!
          return group unless layout_definition.solved?

          layout_definition.pieces.each do |piece|
            if piece['classification'] == 'full'
              add_closed_loop(entities, piece['cell_world_mm'])
            else
              Array(piece['fragments_mm']).each { |loop| add_closed_loop(entities, loop) if loop.length >= 3 }
              Array(piece['void_fragments_mm']).each { |loop| add_closed_loop(entities, loop) if loop.length >= 3 }
            end
          end
          group
        end

        def create_border_group(model, surface_definition:, border_definition:)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Paving Border'
          rebuild_border!(group, surface_definition: surface_definition, border_definition: border_definition)
          group
        end

        def rebuild_border!(group, surface_definition:, border_definition:)
          entities = group.entities
          entities.clear!
          add_closed_loop(entities, surface_definition.outer_boundary_mm)
          if border_definition.follow_holes
            surface_definition.holes_mm.each { |loop| add_closed_loop(entities, loop) }
          end
          group
        end

        def create_parking_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Parking Layout'
          rebuild_parking!(group, definition)
          group
        end

        def rebuild_parking!(group, definition)
          entities = group.entities
          entities.clear!
          definition.bay_boundaries_mm.each { |loop| add_closed_loop(entities, loop) }
          definition.divider_centerlines_mm.each do |start_point, finish_point|
            entities.add_line(point(start_point), point(finish_point))
          end
          group
        end

        private

        def add_closed_loop(entities, loop)
          points = loop.map { |value| point(value) }
          points.each_with_index do |start_point, index|
            entities.add_line(start_point, points[(index + 1) % points.length])
          end
        end

        def point(values_mm)
          x, y, z = Core::Units.point_from_mm(values_mm)
          Geom::Point3d.new(x, y, z)
        end
      end
    end
  end
end
