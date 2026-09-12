# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      class BeamDefinition
        SCHEMA_VERSION = 1

        attr_reader :path_mm, :section_mm, :base_level_id, :base_offset_mm,
                    :base_elevation_mm, :material, :engineering_status

        def initialize(path_mm:, section_mm: [200, 300], base_level_id: nil, base_offset_mm: 0,
                       base_elevation_mm:, material: 'reinforced_concrete', engineering_status: 'preliminary')
          @path_mm = normalize_path(path_mm).freeze
          @section_mm = normalize_section(section_mm).freeze
          @base_level_id = base_level_id&.to_s
          @base_offset_mm = Float(base_offset_mm)
          @base_elevation_mm = Float(base_elevation_mm)
          @material = material.to_s
          @engineering_status = engineering_status.to_s
          freeze
        end

        def errors
          result = []
          result << 'beam requires exactly two points' unless path_mm.length == 2
          result << 'beam path contains zero length' if path_mm.length == 2 && path_mm.first == path_mm.last
          result << 'beam width must be greater than zero' unless section_mm[0].positive?
          result << 'beam depth must be greater than zero' unless section_mm[1].positive?
          result << 'unsupported beam material' unless %w[reinforced_concrete steel timber generic].include?(material)
          result << 'unsupported engineering status' unless %w[preliminary engineer_approved as_built].include?(engineering_status)
          result
        end

        def valid?
          errors.empty?
        end

        def length_mm
          a, b = path_mm
          Math.sqrt(((b[0] - a[0])**2) + ((b[1] - a[1])**2))
        end

        def volume_mm3
          length_mm * section_mm[0] * section_mm[1]
        end

        def bounding_box_mm
          half_width = section_mm[0] / 2.0
          x_values = path_mm.map { |point| point[0] }
          y_values = path_mm.map { |point| point[1] }
          {
            min: [x_values.min - half_width, y_values.min - half_width, base_elevation_mm],
            max: [x_values.max + half_width, y_values.max + half_width, base_elevation_mm + section_mm[1]]
          }.freeze
        end

        def with(path_mm: self.path_mm, section_mm: self.section_mm, base_level_id: self.base_level_id,
                 base_offset_mm: self.base_offset_mm, base_elevation_mm: self.base_elevation_mm,
                 material: self.material, engineering_status: self.engineering_status)
          self.class.new(path_mm: path_mm, section_mm: section_mm, base_level_id: base_level_id,
                         base_offset_mm: base_offset_mm, base_elevation_mm: base_elevation_mm,
                         material: material, engineering_status: engineering_status)
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION, 'path_mm' => path_mm, 'section_mm' => section_mm,
            'base_level_id' => base_level_id, 'base_offset_mm' => base_offset_mm,
            'base_elevation_mm' => base_elevation_mm, 'material' => material,
            'engineering_status' => engineering_status
          }
        end

        def self.from_h(value)
          data = value || {}
          new(path_mm: data['path_mm'] || data[:path_mm] || [], section_mm: data['section_mm'] || data[:section_mm] || [200, 300],
              base_level_id: data['base_level_id'] || data[:base_level_id], base_offset_mm: data['base_offset_mm'] || data[:base_offset_mm] || 0,
              base_elevation_mm: data['base_elevation_mm'] || data[:base_elevation_mm] || 0,
              material: data['material'] || data[:material] || 'reinforced_concrete',
              engineering_status: data['engineering_status'] || data[:engineering_status] || 'preliminary')
        end

        private

        def normalize_path(value)
          Array(value).map do |point|
            values = Array(point)
            raise ArgumentError, 'beam point requires x, y, z' unless values.length >= 3
            [Float(values[0]), Float(values[1]), Float(values[2])].freeze
          end
        end

        def normalize_section(value)
          values = Array(value)
          raise ArgumentError, 'beam section requires width and depth' unless values.length >= 2
          [Float(values[0]), Float(values[1])]
        end
      end
    end
  end
end
