# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class GridFramingDefinition
        SCHEMA_VERSION = 1

        attr_reader :origin_point, :x_spans_mm, :y_spans_mm, :levels_mm, :column_type_id, :beam_type_id

        def initialize(origin_point:, x_spans_mm: [4000.0, 4000.0], y_spans_mm: [4000.0, 4000.0], levels_mm: [3000.0], column_type_id: 'C-0.20x0.20', beam_type_id: 'RC-0.20x0.40')
          @origin_point = normalize_point(origin_point).freeze
          @x_spans_mm = Array(x_spans_mm).map { |s| Float(s) }.freeze
          @y_spans_mm = Array(y_spans_mm).map { |s| Float(s) }.freeze
          @levels_mm = Array(levels_mm).map { |l| Float(l) }.freeze
          @column_type_id = column_type_id.to_s
          @beam_type_id = beam_type_id.to_s
          freeze
        end

        def valid?
          errors.empty?
        end

        def errors
          result = []
          result << 'x_spans_mm cannot be empty' if x_spans_mm.empty?
          result << 'y_spans_mm cannot be empty' if y_spans_mm.empty?
          result << 'levels_mm cannot be empty' if levels_mm.empty?
          result.freeze
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'origin_point' => origin_point,
            'x_spans_mm' => x_spans_mm,
            'y_spans_mm' => y_spans_mm,
            'levels_mm' => levels_mm,
            'column_type_id' => column_type_id,
            'beam_type_id' => beam_type_id
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            origin_point: data['origin_point'] || data[:origin_point] || [0, 0, 0],
            x_spans_mm: data['x_spans_mm'] || data[:x_spans_mm] || [4000.0, 4000.0],
            y_spans_mm: data['y_spans_mm'] || data[:y_spans_mm] || [4000.0, 4000.0],
            levels_mm: data['levels_mm'] || data[:levels_mm] || [3000.0],
            column_type_id: data['column_type_id'] || data[:column_type_id] || 'C-0.20x0.20',
            beam_type_id: data['beam_type_id'] || data[:beam_type_id] || 'RC-0.20x0.40'
          )
        end

        private

        def normalize_point(values)
          item = Array(values)
          raise ArgumentError, 'point requires x, y, z' unless item.length >= 3
          [Float(item[0]), Float(item[1]), Float(item[2])]
        end
      end
    end
  end
end
