# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class FloorGeometry
        def create_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Architectural Floor'
          rebuild!(group, definition)
          group
        end

        def rebuild!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          face = entities.add_face(definition.boundary_mm.map { |point| point_from_mm(point) })
          raise 'failed to create floor face' unless face

          definition.holes_mm.each do |loop|
            hole = entities.add_face(loop.map { |point| point_from_mm(point) })
            hole.erase! if hole && hole.respond_to?(:valid?) && hole.valid?
          end
          face.pushpull(Core::Units.mm_to_su(definition.thickness_mm))
          group
        end

        private

        def point_from_mm(values)
          x, y, z = Core::Units.point_from_mm(values)
          Geom::Point3d.new(x, y, z)
        end
      end
    end
  end
end
