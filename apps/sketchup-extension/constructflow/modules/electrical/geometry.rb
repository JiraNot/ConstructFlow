# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      class Geometry
        MARKER_RADIUS_MM = 75.0

        def create_device_group(model, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?
          group = model.active_entities.add_group
          group.name = "ConstructFlow Electrical #{definition.kind}"
          rebuild_device!(group, definition)
          group
        end

        def rebuild_device!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?
          entities = group.entities
          entities.clear!
          center = definition.position_mm
          draw_cross(entities, center)
          group
        end

        def create_conduit_group(model, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?
          group = model.active_entities.add_group
          group.name = "ConstructFlow Conduit #{definition.nominal_size_mm}mm"
          rebuild_conduit!(group, definition)
          group
        end

        def rebuild_conduit!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?
          entities = group.entities
          entities.clear!
          definition.route_nodes_mm.each_cons(2) do |a, b|
            entities.add_line(point(a), point(b))
          end
          group
        end

        private

        def draw_cross(entities, center)
          x, y, z = center
          r = MARKER_RADIUS_MM
          entities.add_line(point([x - r, y, z]), point([x + r, y, z]))
          entities.add_line(point([x, y - r, z]), point([x, y + r, z]))
        end

        def point(values_mm)
          x, y, z = Core::Units.point_from_mm(values_mm)
          Geom::Point3d.new(x, y, z)
        end
      end
    end
  end
end
