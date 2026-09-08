# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class WallDefinition
        SCHEMA_VERSION = 1
        DEFAULT_THICKNESS_MM = 100.0
        DEFAULT_HEIGHT_MM = 2800.0

        attr_reader :path_mm, :thickness_mm, :height_mm, :base_offset_mm,
                    :wall_type_id, :orientation, :geometry_mode

        def initialize(path_mm:, thickness_mm: DEFAULT_THICKNESS_MM, height_mm: DEFAULT_HEIGHT_MM,
                       base_offset_mm: 0, wall_type_id: 'generic.wall.100',
                       orientation: 'center', geometry_mode: 'parametric')
          @path_mm = normalize_path(path_mm).freeze
          @thickness_mm = Float(thickness_mm)
          @height_mm = Float(height_mm)
          @base_offset_mm = Float(base_offset_mm)
          @wall_type_id = wall_type_id.to_s
          @orientation = orientation.to_s
          @geometry_mode = geometry_mode.to_s
          freeze
        end

        def valid?
          errors.empty?
        end

        def errors
          result = []
          result << 'wall path requires at least two points' if path_mm.length < 2
          result << 'wall thickness must be greater than zero' unless thickness_mm.positive?
          result << 'wall height must be greater than zero' unless height_mm.positive?
          result << 'wall path contains zero-length segment' if segment_lengths_mm.any? { |length| length <= 0.001 }
          result
        end

        def length_mm
          segment_lengths_mm.sum
        end

        def gross_area_mm2
          length_mm * height_mm
        end

        def volume_mm3
          gross_area_mm2 * thickness_mm
        end

        def with(path_mm: self.path_mm, thickness_mm: self.thickness_mm,
                 height_mm: self.height_mm, base_offset_mm: self.base_offset_mm,
                 wall_type_id: self.wall_type_id, orientation: self.orientation,
                 geometry_mode: self.geometry_mode)
          self.class.new(
            path_mm: path_mm,
            thickness_mm: thickness_mm,
            height_mm: height_mm,
            base_offset_mm: base_offset_mm,
            wall_type_id: wall_type_id,
            orientation: orientation,
            geometry_mode: geometry_mode
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'path_mm' => path_mm,
            'thickness_mm' => thickness_mm,
            'height_mm' => height_mm,
            'base_offset_mm' => base_offset_mm,
            'wall_type_id' => wall_type_id,
            'orientation' => orientation,
            'geometry_mode' => geometry_mode
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            path_mm: data['path_mm'] || data[:path_mm] || [],
            thickness_mm: data['thickness_mm'] || data[:thickness_mm] || DEFAULT_THICKNESS_MM,
            height_mm: data['height_mm'] || data[:height_mm] || DEFAULT_HEIGHT_MM,
            base_offset_mm: data['base_offset_mm'] || data[:base_offset_mm] || 0,
            wall_type_id: data['wall_type_id'] || data[:wall_type_id] || 'generic.wall.100',
            orientation: data['orientation'] || data[:orientation] || 'center',
            geometry_mode: data['geometry_mode'] || data[:geometry_mode] || 'parametric'
          )
        end

        private

        def normalize_path(path)
          Array(path).map do |point|
            values = Array(point)
            raise ArgumentError, 'wall path point requires x, y, z' unless values.length >= 3

            [Float(values[0]), Float(values[1]), Float(values[2])].freeze
          end
        end

        def segment_lengths_mm
          path_mm.each_cons(2).map do |a, b|
            dx = b[0] - a[0]
            dy = b[1] - a[1]
            dz = b[2] - a[2]
            Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
          end.freeze
        end
      end
    end
  end
end
