# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class SectionDefinition
        attr_reader :title, :cut_line, :station_length, :cut_elements,
                    :elevation_elements, :level_markers

        def initialize(title:, cut_line:, station_length:, cut_elements: [],
                       elevation_elements: [], level_markers: [])
          @title = title.to_s.strip
          @cut_line = cut_line.freeze
          @station_length = Float(station_length)
          @cut_elements = Array(cut_elements).freeze
          @elevation_elements = Array(elevation_elements).freeze
          @level_markers = Array(level_markers).freeze
          freeze
        end

        def to_h
          {
            'title' => title,
            'cut_line' => cut_line,
            'station_length' => station_length,
            'cut_elements' => cut_elements,
            'elevation_elements' => elevation_elements,
            'level_markers' => level_markers
          }
        end
      end

      class SectionGenerator
        def generate(cut_line:, walls: [], slabs: [], levels: [], title: 'Building Section A-A')
          p1 = cut_line[:start_point_mm] || cut_line['start_point_mm']
          p2 = cut_line[:end_point_mm] || cut_line['end_point_mm']
          raise ArgumentError, 'cut line start and end points required' unless p1 && p2

          dx = p2[0] - p1[0]
          dy = p2[1] - p1[1]
          len = Math.hypot(dx, dy)
          raise ArgumentError, 'cut line length must be greater than zero' if len <= 0.0

          dir_x = dx / len
          dir_y = dy / len

          cut_elements = []
          elevation_elements = []

          walls.each do |wall|
            w_start = get_point(wall, :start_point_mm)
            w_end = get_point(wall, :end_point_mm)
            next unless w_start && w_end

            intersect = segment_intersection(p1, p2, w_start, w_end)
            height = get_float(wall, :height_mm, 2800.0)
            thickness = get_float(wall, :thickness_mm, 150.0)
            base_z = w_start[2] || 0.0
            top_z = base_z + height

            if intersect
              # Wall is cut by section plane
              station = intersect[:t] * len
              cut_elements << {
                type: 'wall_cut',
                wall_id: get_val(wall, :id) || get_val(wall, :wall_id),
                station_center: station.round(1),
                station_min: (station - thickness / 2.0).round(1),
                station_max: (station + thickness / 2.0).round(1),
                z_base: base_z.round(1),
                z_top: top_z.round(1),
                material: get_val(wall, :material) || 'masonry',
                hatch_pattern: 'masonry_cross'
              }
            else
              # Wall might be in elevation behind the cut plane
              s1 = project_point_on_line(p1, dir_x, dir_y, w_start)
              s2 = project_point_on_line(p1, dir_x, dir_y, w_end)
              if s1 && s2 && ((s1 >= 0 && s1 <= len) || (s2 >= 0 && s2 <= len))
                elevation_elements << {
                  type: 'wall_elevation',
                  wall_id: get_val(wall, :id) || get_val(wall, :wall_id),
                  station_start: [s1, s2].min.round(1),
                  station_end: [s1, s2].max.round(1),
                  z_base: base_z.round(1),
                  z_top: top_z.round(1)
                }
              end
            end
          end

          # Add cut slabs/floors
          slabs.each do |slab|
            thickness = get_float(slab, :thickness_mm, 150.0)
            elev = get_float(slab, :elevation_mm, 0.0)
            cut_elements << {
              type: 'slab_cut',
              station_min: 0.0,
              station_max: len.round(1),
              z_base: (elev - thickness).round(1),
              z_top: elev.round(1),
              material: 'reinforced_concrete',
              hatch_pattern: 'concrete_aggregate'
            }
          end

          # Level markers along vertical axis
          level_markers = levels.map do |lvl|
            name = lvl.is_a?(Hash) ? (lvl['name'] || lvl[:name]) : lvl.to_s
            elev = lvl.is_a?(Hash) ? Float(lvl['elevation_mm'] || lvl[:elevation_mm] || 0.0) : 0.0
            {
              name: name,
              elevation_mm: elev,
              marker_station: -200.0,
              station_end: len + 200.0
            }
          end

          SectionDefinition.new(
            title: title,
            cut_line: { start_point_mm: p1, end_point_mm: p2 },
            station_length: len.round(1),
            cut_elements: cut_elements,
            elevation_elements: elevation_elements,
            level_markers: level_markers
          )
        end

        private

        def segment_intersection(p1, p2, p3, p4)
          x1, y1 = p1[0], p1[1]
          x2, y2 = p2[0], p2[1]
          x3, y3 = p3[0], p3[1]
          x4, y4 = p4[0], p4[1]

          denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4)
          return nil if denom.abs < 1e-9

          t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom
          u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom

          return nil unless t >= 0.0 && t <= 1.0 && u >= 0.0 && u <= 1.0

          {
            t: t,
            point: [x1 + t * (x2 - x1), y1 + t * (y2 - y1)]
          }
        end

        def project_point_on_line(p_origin, dir_x, dir_y, pt)
          vx = pt[0] - p_origin[0]
          vy = pt[1] - p_origin[1]
          vx * dir_x + vy * dir_y
        end

        def get_point(obj, key)
          val = get_val(obj, key)
          val.is_a?(Array) ? val : nil
        end

        def get_float(obj, key, default)
          val = get_val(obj, key)
          val ? Float(val) : default
        end

        def get_val(obj, key)
          if obj.respond_to?(key)
            obj.public_send(key)
          elsif obj.is_a?(Hash)
            obj[key] || obj[key.to_s]
          end
        end
      end
    end
  end
end
