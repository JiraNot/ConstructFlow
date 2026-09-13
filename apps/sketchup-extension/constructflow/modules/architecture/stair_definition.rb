# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class StairDefinition
        SCHEMA_VERSION = 1

        attr_reader :start_point, :direction, :type, :width_mm, :height_mm, :tread_count, :riser_count, :tread_depth_mm, :riser_height_mm, :level_id, :material_id

        def initialize(start_point:, direction:, width_mm: 1000.0, height_mm: 3000.0, tread_count: 14, riser_count: 15, tread_depth_mm: 250.0, riser_height_mm: 200.0, type: :straight, level_id: nil, material_id: nil)
          @start_point = normalize_point(start_point).freeze
          @direction = normalize_vector(direction).freeze
          @width_mm = Float(width_mm)
          @height_mm = Float(height_mm)
          @tread_count = Integer(tread_count)
          @riser_count = Integer(riser_count)
          @tread_depth_mm = Float(tread_depth_mm)
          @riser_height_mm = Float(riser_height_mm)
          @type = type.to_sym
          @level_id = level_id&.to_s
          @material_id = material_id&.to_s
          freeze
        end

        def valid?
          errors.empty?
        end

        def errors
          result = []
          result << 'stair width must be greater than zero' unless width_mm.positive?
          result << 'stair height must be greater than zero' unless height_mm.positive?
          result << 'tread count must be positive' unless tread_count.positive?
          result << 'riser count must be positive' unless riser_count.positive?
          result << 'tread depth must be positive' unless tread_depth_mm.positive?
          result << 'riser height must be positive' unless riser_height_mm.positive?
          result.freeze
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'start_point' => start_point,
            'direction' => direction,
            'width_mm' => width_mm,
            'height_mm' => height_mm,
            'tread_count' => tread_count,
            'riser_count' => riser_count,
            'tread_depth_mm' => tread_depth_mm,
            'riser_height_mm' => riser_height_mm,
            'type' => type.to_s,
            'level_id' => level_id,
            'material_id' => material_id
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            start_point: data['start_point'] || data[:start_point] || [0, 0, 0],
            direction: data['direction'] || data[:direction] || [1, 0, 0],
            width_mm: data['width_mm'] || data[:width_mm] || 1000.0,
            height_mm: data['height_mm'] || data[:height_mm] || 3000.0,
            tread_count: data['tread_count'] || data[:tread_count] || 14,
            riser_count: data['riser_count'] || data[:riser_count] || 15,
            tread_depth_mm: data['tread_depth_mm'] || data[:tread_depth_mm] || 250.0,
            riser_height_mm: data['riser_height_mm'] || data[:riser_height_mm] || 200.0,
            type: (data['type'] || data[:type] || :straight).to_sym,
            level_id: data['level_id'] || data[:level_id],
            material_id: data['material_id'] || data[:material_id]
          )
        end

        private

        def normalize_point(values)
          item = Array(values)
          raise ArgumentError, 'point requires x, y, z' unless item.length >= 3
          [Float(item[0]), Float(item[1]), Float(item[2])]
        end

        def normalize_vector(values)
          item = Array(values)
          raise ArgumentError, 'vector requires x, y, z' unless item.length >= 3
          mag = Math.sqrt(item[0]**2 + item[1]**2 + item[2]**2)
          mag = 1.0 if mag == 0
          [Float(item[0])/mag, Float(item[1])/mag, Float(item[2])/mag]
        end
      end
    end
  end
end
