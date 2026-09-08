# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      class Geometry
        def create_roof_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Roof'
          rebuild_roof!(group, definition)
          group
        end

        def rebuild_roof!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          points = definition.sloped_points_mm.map { |value| point(value) }
          face = entities.add_face(points)
          raise 'failed to create roof face' unless face

          group
        end

        def create_gutter_group(model, roof_object:, definition:, edge_capability:)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Gutter'
          rebuild_gutter!(group, roof_object: roof_object, definition: definition, edge_capability: edge_capability)
          group
        end

        def rebuild_gutter!(group, roof_object:, definition:, edge_capability:)
          entities = group.entities
          entities.clear!
          a, b = edge_capability.edge_points_mm(roof_object, definition.edge_index)
          entities.add_line(point(a), point(b))
          group
        end

        private

        def point(values_mm)
          x, y, z = Core::Units.point_from_mm(values_mm)
          Geom::Point3d.new(x, y, z)
        end
      end
    end
  end
end
