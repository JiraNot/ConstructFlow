# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class CeilingDefinition
        SCHEMA_VERSION = 1

        attr_reader :boundary_mm, :holes_mm, :level_id, :height_mm, :offset_mm, :thickness_mm, :material_id

        def initialize(boundary_mm:, holes_mm: [], level_id: nil, height_mm: 2_700, offset_mm: 0,
                       thickness_mm: 12, material_id: nil)
          @boundary_mm = normalize_loop(boundary_mm).freeze
          @holes_mm = Array(holes_mm).map { |loop| normalize_loop(loop).freeze }.freeze
          @level_id = level_id&.to_s
          @height_mm = Float(height_mm)
          @offset_mm = Float(offset_mm)
          @thickness_mm = Float(thickness_mm)
          @material_id = material_id&.to_s
          freeze
        end

        def errors
          result = []
          result << 'ceiling boundary requires at least three points' if boundary_mm.length < 3
          result << 'ceiling boundary area must be greater than zero' if boundary_mm.length >= 3 && area_mm2 <= 1.0
          result << 'ceiling height must be zero or greater' if height_mm.negative?
          result << 'ceiling thickness must be greater than zero' unless thickness_mm.positive?
          holes_mm.each_with_index do |loop, index|
            result << "ceiling hole #{index + 1} requires at least three points" if loop.length < 3
          end
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def area_mm2
          return 0.0 if boundary_mm.length < 3

          boundary_mm.each_with_index.sum do |point, index|
            nxt = boundary_mm[(index + 1) % boundary_mm.length]
            (point[0] * nxt[1]) - (nxt[0] * point[1])
          end.abs / 2.0
        end

        def net_area_mm2
          [area_mm2 - holes_mm.sum { |loop| polygon_area_mm2(loop) }, 0.0].max
        end

        def with(boundary_mm: self.boundary_mm, holes_mm: self.holes_mm, level_id: self.level_id,
                 height_mm: self.height_mm, offset_mm: self.offset_mm, thickness_mm: self.thickness_mm,
                 material_id: self.material_id)
          self.class.new(boundary_mm: boundary_mm, holes_mm: holes_mm, level_id: level_id, height_mm: height_mm,
                         offset_mm: offset_mm, thickness_mm: thickness_mm, material_id: material_id)
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION, 'boundary_mm' => boundary_mm, 'holes_mm' => holes_mm,
            'level_id' => level_id, 'height_mm' => height_mm, 'offset_mm' => offset_mm,
            'thickness_mm' => thickness_mm, 'material_id' => material_id
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            boundary_mm: data['boundary_mm'] || data[:boundary_mm] || [], holes_mm: data['holes_mm'] || data[:holes_mm] || [],
            level_id: data['level_id'] || data[:level_id], height_mm: data['height_mm'] || data[:height_mm] || 2700,
            offset_mm: data['offset_mm'] || data[:offset_mm] || 0, thickness_mm: data['thickness_mm'] || data[:thickness_mm] || 12,
            material_id: data['material_id'] || data[:material_id]
          )
        end

        private

        def normalize_loop(values)
          Array(values).map do |point|
            item = Array(point)
            raise ArgumentError, 'ceiling point requires x, y, z' unless item.length >= 3

            [Float(item[0]), Float(item[1]), Float(item[2])].freeze
          end
        end

        def polygon_area_mm2(loop)
          return 0.0 if loop.length < 3

          loop.each_with_index.sum do |point, index|
            nxt = loop[(index + 1) % loop.length]
            (point[0] * nxt[1]) - (nxt[0] * point[1])
          end.abs / 2.0
        end
      end
    end
  end
end
