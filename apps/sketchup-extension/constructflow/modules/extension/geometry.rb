# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      class Geometry
        def create_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Extension Zone'
          rebuild!(group, definition)
          group
        end

        def rebuild!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          points = definition.boundary_mm.map { |value| point(value) }
          face = entities.add_face(points)
          raise 'failed to create extension boundary face' unless face

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
