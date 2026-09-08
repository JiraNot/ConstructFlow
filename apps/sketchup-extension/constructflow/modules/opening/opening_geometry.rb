# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Opening
      class OpeningGeometry
        def create_group(model, host_object:, definition:, host_capability:)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Opening'
          rebuild!(group, host_object: host_object, definition: definition, host_capability: host_capability)
          group
        end

        def rebuild!(group, host_object:, definition:, host_capability:)
          entities = group.entities
          entities.clear!
          points = host_capability.opening_frame_points(host_object, definition.host_descriptor)
          su_points = points.map do |values|
            x, y, z = Core::Units.point_from_mm(values)
            Geom::Point3d.new(x, y, z)
          end
          su_points.each_with_index do |point, index|
            entities.add_line(point, su_points[(index + 1) % su_points.length])
          end
          group
        end
      end
    end
  end
end
