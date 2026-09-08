# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      class FoundationDefinition
        SCHEMA_VERSION = 1
        TYPES = %w[spread_footing pile_cap].freeze
        ENGINEERING_STATUSES = %w[preliminary engineer_approved as_built].freeze

        attr_reader :foundation_type, :center_mm, :size_mm, :top_elevation_mm,
                    :supported_object_id, :material, :engineering_status

        def initialize(center_mm:, size_mm: [800, 800, 300], top_elevation_mm:,
                       foundation_type: 'spread_footing', supported_object_id: nil,
                       material: 'reinforced_concrete', engineering_status: 'preliminary')
          @center_mm = normalize_point(center_mm).freeze
          @size_mm = normalize_size(size_mm).freeze
          @top_elevation_mm = Float(top_elevation_mm)
          @foundation_type = foundation_type.to_s
          @supported_object_id = supported_object_id&.to_s
          @material = material.to_s
          @engineering_status = engineering_status.to_s
          freeze
        end

        def errors
          result = []
          result << 'unsupported foundation type' unless TYPES.include?(foundation_type)
          result << 'foundation width must be greater than zero' unless size_mm[0].positive?
          result << 'foundation length must be greater than zero' unless size_mm[1].positive?
          result << 'foundation thickness must be greater than zero' unless size_mm[2].positive?
          result << 'unsupported engineering status' unless ENGINEERING_STATUSES.include?(engineering_status)
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def bottom_elevation_mm
          top_elevation_mm - size_mm[2]
        end

        def volume_mm3
          size_mm[0] * size_mm[1] * size_mm[2]
        end

        def top_area_mm2
          size_mm[0] * size_mm[1]
        end

        def formwork_area_mm2
          (2.0 * size_mm[0] * size_mm[2]) + (2.0 * size_mm[1] * size_mm[2])
        end

        def bounding_box_mm
          half_x = size_mm[0] / 2.0
          half_y = size_mm[1] / 2.0
          {
            min: [center_mm[0] - half_x, center_mm[1] - half_y, bottom_elevation_mm],
            max: [center_mm[0] + half_x, center_mm[1] + half_y, top_elevation_mm]
          }.freeze
        end

        def with(center_mm: self.center_mm, size_mm: self.size_mm,
                 top_elevation_mm: self.top_elevation_mm,
                 foundation_type: self.foundation_type,
                 supported_object_id: self.supported_object_id,
                 material: self.material, engineering_status: self.engineering_status)
          self.class.new(
            center_mm: center_mm,
            size_mm: size_mm,
            top_elevation_mm: top_elevation_mm,
            foundation_type: foundation_type,
            supported_object_id: supported_object_id,
            material: material,
            engineering_status: engineering_status
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'foundation_type' => foundation_type,
            'center_mm' => center_mm,
            'size_mm' => size_mm,
            'top_elevation_mm' => top_elevation_mm,
            'supported_object_id' => supported_object_id,
            'material' => material,
            'engineering_status' => engineering_status
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            center_mm: data['center_mm'] || data[:center_mm] || [0, 0, 0],
            size_mm: data['size_mm'] || data[:size_mm] || [800, 800, 300],
            top_elevation_mm: data['top_elevation_mm'] || data[:top_elevation_mm] || 0,
            foundation_type: data['foundation_type'] || data[:foundation_type] || 'spread_footing',
            supported_object_id: data['supported_object_id'] || data[:supported_object_id],
            material: data['material'] || data[:material] || 'reinforced_concrete',
            engineering_status: data['engineering_status'] || data[:engineering_status] || 'preliminary'
          )
        end

        private

        def normalize_point(value)
          values = Array(value)
          raise ArgumentError, 'foundation center requires x, y, z' unless values.length >= 3

          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

        def normalize_size(value)
          values = Array(value)
          raise ArgumentError, 'foundation size requires width, length and thickness' unless values.length >= 3

          [Float(values[0]), Float(values[1]), Float(values[2])]
        end
      end
    end
  end
end
