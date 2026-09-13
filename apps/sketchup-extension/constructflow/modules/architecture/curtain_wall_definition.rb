# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class CurtainWallDefinition
        SCHEMA_VERSION = 1

        attr_reader :boundary_mm, :mullion_width_mm, :mullion_depth_mm,
                    :transom_width_mm, :transom_depth_mm, :grid_width_mm,
                    :grid_height_mm, :infill_type, :louver_angle_deg,
                    :infill_thickness_mm

        def initialize(
          boundary_mm:,
          mullion_width_mm: 50.0,
          mullion_depth_mm: 100.0,
          transom_width_mm: 50.0,
          transom_depth_mm: 100.0,
          grid_width_mm: 1000.0,
          grid_height_mm: 1200.0,
          infill_type: :glass,
          louver_angle_deg: 0.0,
          infill_thickness_mm: 8.0
        )
          @boundary_mm = normalize_loop(boundary_mm).freeze
          @mullion_width_mm = Float(mullion_width_mm)
          @mullion_depth_mm = Float(mullion_depth_mm)
          @transom_width_mm = Float(transom_width_mm)
          @transom_depth_mm = Float(transom_depth_mm)
          @grid_width_mm = Float(grid_width_mm)
          @grid_height_mm = Float(grid_height_mm)
          @infill_type = infill_type.to_sym
          @louver_angle_deg = Float(louver_angle_deg)
          @infill_thickness_mm = Float(infill_thickness_mm)
          freeze
        end

        def valid?
          errors.empty?
        end

        def errors
          result = []
          result << 'boundary requires at least three points' if boundary_mm.length < 3
          result << 'grid width must be positive' unless grid_width_mm.positive?
          result << 'grid height must be positive' unless grid_height_mm.positive?
          result.freeze
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'boundary_mm' => boundary_mm,
            'mullion_width_mm' => mullion_width_mm,
            'mullion_depth_mm' => mullion_depth_mm,
            'transom_width_mm' => transom_width_mm,
            'transom_depth_mm' => transom_depth_mm,
            'grid_width_mm' => grid_width_mm,
            'grid_height_mm' => grid_height_mm,
            'infill_type' => infill_type.to_s,
            'louver_angle_deg' => louver_angle_deg,
            'infill_thickness_mm' => infill_thickness_mm
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            boundary_mm: data['boundary_mm'] || data[:boundary_mm] || [],
            mullion_width_mm: data['mullion_width_mm'] || data[:mullion_width_mm] || 50.0,
            mullion_depth_mm: data['mullion_depth_mm'] || data[:mullion_depth_mm] || 100.0,
            transom_width_mm: data['transom_width_mm'] || data[:transom_width_mm] || 50.0,
            transom_depth_mm: data['transom_depth_mm'] || data[:transom_depth_mm] || 100.0,
            grid_width_mm: data['grid_width_mm'] || data[:grid_width_mm] || 1000.0,
            grid_height_mm: data['grid_height_mm'] || data[:grid_height_mm] || 1200.0,
            infill_type: (data['infill_type'] || data[:infill_type] || :glass).to_sym,
            louver_angle_deg: data['louver_angle_deg'] || data[:louver_angle_deg] || 0.0,
            infill_thickness_mm: data['infill_thickness_mm'] || data[:infill_thickness_mm] || 8.0
          )
        end

        private

        def normalize_loop(values)
          Array(values).map do |point|
            item = Array(point)
            raise ArgumentError, 'point requires x, y, z' unless item.length >= 3
            [Float(item[0]), Float(item[1]), Float(item[2])].freeze
          end
        end
      end
    end
  end
end
