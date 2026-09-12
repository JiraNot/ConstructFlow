# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      class ColumnDefinition
        SCHEMA_VERSION = 1
        MATERIALS = %w[reinforced_concrete steel timber generic].freeze
        ENGINEERING_STATUSES = %w[preliminary engineer_approved as_built].freeze

        attr_reader :location_mm, :section_mm, :base_level_id, :top_level_id,
                    :base_offset_mm, :top_offset_mm, :base_elevation_mm,
                    :top_elevation_mm, :material, :section_type,
                    :engineering_status, :anchor, :profile_code

        def initialize(location_mm:, section_mm: [200, 200], base_level_id: nil,
                       top_level_id: nil, base_offset_mm: 0, top_offset_mm: 0,
                       base_elevation_mm:, top_elevation_mm:, material: 'reinforced_concrete',
                       section_type: 'rectangular', engineering_status: 'preliminary', anchor: :center, profile_code: nil)
          @location_mm = normalize_point(location_mm).freeze
          @section_mm = normalize_section(section_mm).freeze
          @base_level_id = base_level_id&.to_s
          @top_level_id = top_level_id&.to_s
          @base_offset_mm = Float(base_offset_mm)
          @top_offset_mm = Float(top_offset_mm)
          @base_elevation_mm = Float(base_elevation_mm)
          @top_elevation_mm = Float(top_elevation_mm)
          @material = material.to_s
          @section_type = section_type.to_s
          @engineering_status = engineering_status.to_s
          @anchor = (anchor || :center).to_sym
          @profile_code = profile_code&.to_s
          freeze
        end

        def errors
          result = []
          result << 'column width must be greater than zero' unless section_mm[0].positive?
          result << 'column depth must be greater than zero' unless section_mm[1].positive?
          result << 'column top elevation must be above base elevation' unless height_mm.positive?
          result << 'unsupported column material' unless MATERIALS.include?(material)
          result << 'unsupported engineering status' unless ENGINEERING_STATUSES.include?(engineering_status)
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def height_mm
          top_elevation_mm - base_elevation_mm
        end

        def cross_section_area_mm2
          section_mm[0] * section_mm[1]
        end

        def volume_mm3
          cross_section_area_mm2 * height_mm
        end

        def bounding_box_mm
          half_x = section_mm[0] / 2.0
          half_y = section_mm[1] / 2.0
          {
            min: [location_mm[0] - half_x, location_mm[1] - half_y, base_elevation_mm],
            max: [location_mm[0] + half_x, location_mm[1] + half_y, top_elevation_mm]
          }.freeze
        end

        def plan_reference_points_mm
          half_x = section_mm[0] / 2.0
          half_y = section_mm[1] / 2.0
          x, y, z = location_mm
          [
            [x, y, z],
            [x - half_x, y, z], [x + half_x, y, z],
            [x, y - half_y, z], [x, y + half_y, z]
          ].map(&:freeze).freeze
        end

        def with(location_mm: self.location_mm, section_mm: self.section_mm,
                 base_level_id: self.base_level_id, top_level_id: self.top_level_id,
                 base_offset_mm: self.base_offset_mm, top_offset_mm: self.top_offset_mm,
                 base_elevation_mm: self.base_elevation_mm, top_elevation_mm: self.top_elevation_mm,
                 material: self.material, section_type: self.section_type,
                 engineering_status: self.engineering_status)
          self.class.new(
            location_mm: location_mm,
            section_mm: section_mm,
            base_level_id: base_level_id,
            top_level_id: top_level_id,
            base_offset_mm: base_offset_mm,
            top_offset_mm: top_offset_mm,
            base_elevation_mm: base_elevation_mm,
            top_elevation_mm: top_elevation_mm,
            material: material,
            section_type: section_type,
            engineering_status: engineering_status
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'location_mm' => location_mm,
            'section_mm' => section_mm,
            'base_level_id' => base_level_id,
            'top_level_id' => top_level_id,
            'base_offset_mm' => base_offset_mm,
            'top_offset_mm' => top_offset_mm,
            'base_elevation_mm' => base_elevation_mm,
            'top_elevation_mm' => top_elevation_mm,
            'material' => material,
            'section_type' => section_type,
            'engineering_status' => engineering_status,
            'anchor' => anchor.to_s,
            'profile_code' => profile_code
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            location_mm: data['location_mm'] || data[:location_mm] || [0, 0, 0],
            section_mm: data['section_mm'] || data[:section_mm] || [200, 200],
            base_level_id: data['base_level_id'] || data[:base_level_id],
            top_level_id: data['top_level_id'] || data[:top_level_id],
            base_offset_mm: data['base_offset_mm'] || data[:base_offset_mm] || 0,
            top_offset_mm: data['top_offset_mm'] || data[:top_offset_mm] || 0,
            base_elevation_mm: data['base_elevation_mm'] || data[:base_elevation_mm] || 0,
            top_elevation_mm: data['top_elevation_mm'] || data[:top_elevation_mm] || 2800,
            material: data['material'] || data[:material] || 'reinforced_concrete',
            section_type: data['section_type'] || data[:section_type] || 'rectangular',
            engineering_status: data['engineering_status'] || data[:engineering_status] || 'preliminary'
          )
        end

        private

        def normalize_point(value)
          values = Array(value)
          raise ArgumentError, 'column location requires x, y, z' unless values.length >= 3

          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

        def normalize_section(value)
          values = Array(value)
          raise ArgumentError, 'column section requires width and depth' unless values.length >= 2

          [Float(values[0]), Float(values[1])]
        end
      end
    end
  end
end
