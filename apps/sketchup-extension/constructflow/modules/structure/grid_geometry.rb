# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      class GridGeometry
        def create_group(model, definition)
          group = model.active_entities.add_group
          group.name = "ConstructFlow Grid #{definition.name}"
          rebuild!(group, definition)
          group
        end

        def rebuild!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          start_mm, finish_mm = definition.path_mm
          entities.add_line(point(start_mm), point(finish_mm))
          group
        end

        private

        def point(values_mm)
          values = Core::Units.point_from_mm(values_mm)
          Geom::Point3d.new(*values)
        end
      end
    end
  end
end
