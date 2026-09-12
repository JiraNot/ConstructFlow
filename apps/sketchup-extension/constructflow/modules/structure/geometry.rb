# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      class Geometry
        def rebuild_beam!(group, definition)
          BeamGeometry.new.rebuild!(group, definition)
        end

        def create_column_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Structural Column'
          rebuild_column!(group, definition)
          group
        end

        def rebuild_column!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          x, y, = definition.location_mm
          width, depth = definition.section_mm
          half_w = width / 2.0
          half_d = depth / 2.0
          z = definition.base_elevation_mm

          anchor = definition.respond_to?(:anchor) ? definition.anchor : :center
          offset = Core::StructuralProfileCatalog.anchor_offset(anchor, width, depth) rescue [0.0, 0.0]
          cx = x - offset[0]
          cy = y - offset[1]

          face = entities.add_face(
            point([cx - half_w, cy - half_d, z]),
            point([cx + half_w, cy - half_d, z]),
            point([cx + half_w, cy + half_d, z]),
            point([cx - half_w, cy + half_d, z])
          )
          raise 'failed to create structural column face' unless face

          face.reverse! if face.normal.z < 0
          face.pushpull(Core::Units.mm_to_su(definition.height_mm))
          group
        end

        def create_foundation_group(model, definition)
          group = model.active_entities.add_group
          group.name = "ConstructFlow #{definition.foundation_type.tr('_', ' ').capitalize}"
          rebuild_foundation!(group, definition)
          group
        end

        def rebuild_foundation!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          x, y, = definition.center_mm
          width, length, thickness = definition.size_mm
          half_w = width / 2.0
          half_l = length / 2.0
          z = definition.bottom_elevation_mm

          face = entities.add_face(
            point([x - half_w, y - half_l, z]),
            point([x + half_w, y - half_l, z]),
            point([x + half_w, y + half_l, z]),
            point([x - half_w, y + half_l, z])
          )
          raise 'failed to create foundation face' unless face

          face.reverse! if face.normal.z < 0
          face.pushpull(Core::Units.mm_to_su(thickness))
          group
        end

        def create_rebar_marker_group(model, host_object:, definition:, host_bounds:)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Semantic Rebar Set'
          rebuild_rebar_marker!(group, host_object: host_object, definition: definition, host_bounds: host_bounds)
          group
        end

        def rebuild_rebar_marker!(group, host_object:, definition:, host_bounds:)
          entities = group.entities
          entities.clear!
          min = host_bounds[:min] || host_bounds['min']
          max = host_bounds[:max] || host_bounds['max']
          z = (Float(min[2]) + Float(max[2])) / 2.0
          entities.add_line(point([min[0], min[1], z]), point([max[0], max[1], z]))
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
