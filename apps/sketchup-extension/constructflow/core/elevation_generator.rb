# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class ElevationDefinition
        attr_reader :title, :direction, :bounds_2d, :wall_elements,
                    :opening_elements, :level_datums

        def initialize(title:, direction:, bounds_2d:, wall_elements: [],
                       opening_elements: [], level_datums: [])
          @title = title.to_s.strip
          @direction = direction.to_s.strip.downcase
          @bounds_2d = bounds_2d.freeze # [u_min, z_min, u_max, z_max]
          @wall_elements = Array(wall_elements).freeze
          @opening_elements = Array(opening_elements).freeze
          @level_datums = Array(level_datums).freeze
          freeze
        end

        def to_h
          {
            'title' => title,
            'direction' => direction,
            'bounds_2d' => bounds_2d,
            'wall_elements' => wall_elements,
            'opening_elements' => opening_elements,
            'level_datums' => level_datums
          }
        end
      end

      class ElevationGenerator
        DIRECTIONS = %w[north south east west].freeze

        def generate(walls:, direction: 'north', openings: [], levels: [], title: nil)
          dir = direction.to_s.strip.downcase
          raise ArgumentError, "unsupported direction: #{dir}" unless DIRECTIONS.include?(dir)

          elev_title = title || "#{dir.capitalize} Elevation"
          projected_walls = []
          projected_openings = []

          walls.each do |wall|
            proj = project_wall(wall, dir)
            projected_walls << proj if proj
          end

          openings.each do |op|
            proj_op = project_opening(op, dir)
            projected_openings << proj_op if proj_op
          end

          # Compute 2D bounds
          all_u = []
          all_z = []
          projected_walls.each do |pw|
            all_u.concat([pw[:u_start], pw[:u_end]])
            all_z.concat([pw[:z_base], pw[:z_top]])
          end

          bounds = if all_u.empty?
                     [0.0, 0.0, 1000.0, 3000.0]
                   else
                     [all_u.min, all_z.min, all_u.max, all_z.max]
                   end

          # Level datums
          datums = levels.map do |lvl|
            name = lvl.is_a?(Hash) ? (lvl['name'] || lvl[:name]) : lvl.to_s
            elev = lvl.is_a?(Hash) ? Float(lvl['elevation_mm'] || lvl[:elevation_mm] || 0.0) : 0.0
            { name: name, elevation_mm: elev, u_range: [bounds[0] - 500.0, bounds[2] + 500.0] }
          end

          ElevationDefinition.new(
            title: elev_title,
            direction: dir,
            bounds_2d: bounds,
            wall_elements: projected_walls,
            opening_elements: projected_openings,
            level_datums: datums
          )
        end

        private

        def project_wall(wall, direction)
          start_pt = get_point(wall, :start_point_mm)
          end_pt = get_point(wall, :end_point_mm)
          return nil unless start_pt && end_pt

          height = get_float(wall, :height_mm, 2800.0)
          base_z = start_pt[2] || 0.0
          top_z = base_z + height

          u1 = project_scalar(start_pt, direction)
          u2 = project_scalar(end_pt, direction)
          u_start, u_end = [u1, u2].min, [u1, u2].max

          # If wall is completely parallel to line of sight (zero width in elevation), skip or thin
          return nil if (u_end - u_start).abs < 1.0

          {
            wall_id: get_val(wall, :id) || get_val(wall, :wall_id),
            u_start: u_start,
            u_end: u_end,
            z_base: base_z,
            z_top: top_z,
            thickness_mm: get_float(wall, :thickness_mm, 150.0),
            wall_type: get_val(wall, :wall_type) || 'standard'
          }
        end

        def project_opening(opening, direction)
          loc = get_point(opening, :location_mm)
          return nil unless loc

          w = get_float(opening, :width_mm, 900.0)
          h = get_float(opening, :height_mm, 2000.0)
          sill_z = get_float(opening, :sill_height_mm, 0.0)
          base_z = (loc[2] || 0.0) + sill_z

          u_center = project_scalar(loc, direction)
          half_w = w / 2.0

          {
            opening_id: get_val(opening, :id) || get_val(opening, :opening_id),
            category: get_val(opening, :category) || 'door',
            u_min: (u_center - half_w).round(1),
            u_max: (u_center + half_w).round(1),
            z_base: base_z.round(1),
            z_top: (base_z + h).round(1),
            width_mm: w,
            height_mm: h
          }
        end

        def project_scalar(pt, direction)
          x, y, _z = pt
          case direction
          when 'north' then x # Looking from North to South: X maps to horizontal U
          when 'south' then -x # Looking from South to North: -X maps to horizontal U
          when 'east'  then -y # Looking from East to West: -Y maps to horizontal U
          when 'west'  then y  # Looking from West to East: +Y maps to horizontal U
          else x
          end
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
