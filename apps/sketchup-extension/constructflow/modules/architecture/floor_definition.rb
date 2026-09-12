# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class FloorDefinition
        SCHEMA_VERSION = 1

        attr_reader :boundary_mm, :holes_mm, :level_id, :offset_mm, :thickness_mm, :material_id

        def initialize(boundary_mm:, holes_mm: [], level_id: nil, offset_mm: 0, thickness_mm: 150, material_id: nil)
          @boundary_mm = normalize_loop(boundary_mm).freeze
          @holes_mm = Array(holes_mm).map { |loop| normalize_loop(loop).freeze }.freeze
          @level_id = level_id&.to_s
          @offset_mm = Float(offset_mm)
          @thickness_mm = Float(thickness_mm)
          @material_id = material_id&.to_s
          freeze
        end

        def valid?
          errors.empty?
        end

        def errors
          result = []
          result << 'floor boundary requires at least three points' if boundary_mm.length < 3
          result << 'floor boundary area must be greater than zero' if boundary_mm.length >= 3 && area_mm2 <= 1.0
          result << 'floor thickness must be greater than zero' unless thickness_mm.positive?
          holes_mm.each_with_index do |loop, index|
            result << "floor hole #{index + 1} requires at least three points" if loop.length < 3
            result << "floor hole #{index + 1} lies outside boundary" if loop.length >= 3 && !point_in_polygon?(loop.first, boundary_mm)
          end
          result.freeze
        end

        def area_mm2
          polygon_area_mm2(boundary_mm)
        end

        def net_area_mm2
          [area_mm2 - holes_mm.sum { |loop| polygon_area_mm2(loop) }, 0.0].max
        end

        def perimeter_mm
          loop_perimeter_mm(boundary_mm) + holes_mm.sum { |loop| loop_perimeter_mm(loop) }
        end

        def with(boundary_mm: self.boundary_mm, holes_mm: self.holes_mm, level_id: self.level_id,
                 offset_mm: self.offset_mm, thickness_mm: self.thickness_mm, material_id: self.material_id)
          self.class.new(
            boundary_mm: boundary_mm, holes_mm: holes_mm, level_id: level_id,
            offset_mm: offset_mm, thickness_mm: thickness_mm, material_id: material_id
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'boundary_mm' => boundary_mm,
            'holes_mm' => holes_mm,
            'level_id' => level_id,
            'offset_mm' => offset_mm,
            'thickness_mm' => thickness_mm,
            'material_id' => material_id
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            boundary_mm: data['boundary_mm'] || data[:boundary_mm] || [],
            holes_mm: data['holes_mm'] || data[:holes_mm] || [],
            level_id: data['level_id'] || data[:level_id],
            offset_mm: data['offset_mm'] || data[:offset_mm] || 0,
            thickness_mm: data['thickness_mm'] || data[:thickness_mm] || 150,
            material_id: data['material_id'] || data[:material_id]
          )
        end

        private

        def normalize_loop(values)
          Array(values).map do |point|
            item = Array(point)
            raise ArgumentError, 'floor point requires x, y, z' unless item.length >= 3

            [Float(item[0]), Float(item[1]), Float(item[2])].freeze
          end
        end

        def polygon_area_mm2(loop)
          return 0.0 if loop.length < 3

          loop.each_with_index.sum do |point, index|
            next_point = loop[(index + 1) % loop.length]
            (point[0] * next_point[1]) - (next_point[0] * point[1])
          end.abs / 2.0
        end

        def loop_perimeter_mm(loop)
          return 0.0 if loop.length < 2

          loop.each_with_index.sum do |point, index|
            next_point = loop[(index + 1) % loop.length]
            Math.sqrt(((next_point[0] - point[0])**2) + ((next_point[1] - point[1])**2))
          end
        end

        def point_in_polygon?(point, loop)
          inside = false
          j = loop.length - 1
          loop.each_with_index do |current, index|
            previous = loop[j]
            crosses = ((current[1] > point[1]) != (previous[1] > point[1])) &&
                      (point[0] < ((previous[0] - current[0]) * (point[1] - current[1]) /
                        ((previous[1] - current[1]).nonzero? || 1e-12)) + current[0])
            inside = !inside if crosses
            j = index
          end
          inside
        end
      end
    end
  end
end
