# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      class Geometry
        def create_cabinet_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Cabinet Run'
          rebuild_cabinet!(group, definition)
          group
        end

        def rebuild_cabinet!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          draw_box(entities, definition)
          draw_modules(entities, definition)
          draw_fronts(entities, definition)
          draw_drawers(entities, definition)
          group
        end

        private

        def draw_box(entities, definition)
          x0 = 0.0
          x1 = definition.width_mm
          y0 = 0.0
          y1 = definition.depth_mm
          z0 = 0.0
          z1 = definition.height_mm
          corners = [
            [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
            [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]
          ]
          edges = [
            [0, 1], [1, 2], [2, 3], [3, 0],
            [4, 5], [5, 6], [6, 7], [7, 4],
            [0, 4], [1, 5], [2, 6], [3, 7]
          ]
          edges.each do |a, b|
            entities.add_line(point(local_to_world(corners[a], definition)), point(local_to_world(corners[b], definition)))
          end
        end

        def draw_modules(entities, definition)
          offsets = definition.module_offsets_mm
          offsets[0...-1].each do |record|
            x = record['end_mm']
            z0 = definition.toe_kick_mm
            z1 = definition.usable_height_mm
            entities.add_line(
              point(local_to_world([x, 0, z0], definition)),
              point(local_to_world([x, 0, z1], definition))
            )
          end
          if definition.toe_kick_mm.positive?
            entities.add_line(
              point(local_to_world([0, 0, definition.toe_kick_mm], definition)),
              point(local_to_world([definition.width_mm, 0, definition.toe_kick_mm], definition))
            )
          end
        end

        def draw_fronts(entities, definition)
          offsets = definition.module_offsets_mm.each_with_object({}) { |record, result| result[record['id']] = record }
          definition.fronts.each do |front|
            next if front['front_type'] == 'open'
            record = offsets[front['module_id']]
            next unless record
            gap = definition.front_gap_mm
            x0 = record['start_mm'] + gap
            x1 = record['end_mm'] - gap
            z0 = definition.toe_kick_mm + gap
            z1 = definition.usable_height_mm - gap
            if front['front_type'] == 'double_swing'
              mid = (x0 + x1) / 2.0
              draw_front_rect(entities, definition, x0, mid - (gap / 2.0), z0, z1)
              draw_front_rect(entities, definition, mid + (gap / 2.0), x1, z0, z1)
            else
              draw_front_rect(entities, definition, x0, x1, z0, z1)
            end
          end
        end

        def draw_drawers(entities, definition)
          offsets = definition.module_offsets_mm.each_with_object({}) { |record, result| result[record['id']] = record }
          definition.drawer_sets.each do |drawer_set|
            record = offsets[drawer_set['module_id']]
            next unless record
            cursor = definition.toe_kick_mm
            Array(drawer_set['heights_mm']).each do |height|
              cursor += Float(height)
              entities.add_line(
                point(local_to_world([record['start_mm'], 0, cursor], definition)),
                point(local_to_world([record['end_mm'], 0, cursor], definition))
              )
            end
          end
        end

        def draw_front_rect(entities, definition, x0, x1, z0, z1)
          loop = [[x0, 0, z0], [x1, 0, z0], [x1, 0, z1], [x0, 0, z1]]
          loop.each_with_index do |start_point, index|
            finish = loop[(index + 1) % loop.length]
            entities.add_line(
              point(local_to_world(start_point, definition)),
              point(local_to_world(finish, definition))
            )
          end
        end

        def local_to_world(local, definition)
          radians = definition.angle_deg * Math::PI / 180.0
          cos = Math.cos(radians)
          sin = Math.sin(radians)
          x = Float(local[0])
          y = Float(local[1])
          [
            definition.origin_mm[0] + (x * cos) - (y * sin),
            definition.origin_mm[1] + (x * sin) + (y * cos),
            definition.origin_mm[2] + Float(local[2])
          ]
        end

        def point(values_mm)
          x, y, z = Core::Units.point_from_mm(values_mm)
          Geom::Point3d.new(x, y, z)
        end
      end
    end
  end
end
