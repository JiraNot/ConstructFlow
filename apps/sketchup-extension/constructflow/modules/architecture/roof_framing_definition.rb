# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class RoofFramingDefinition
        SCHEMA_VERSION = 1

        attr_reader :boundary_mm, :pitch_degrees, :truss_spacing_mm, :purlin_spacing_mm, :overhang_mm, :type

        def initialize(boundary_mm:, pitch_degrees: 30.0, truss_spacing_mm: 1000.0, purlin_spacing_mm: 300.0, overhang_mm: 600.0, type: :gable)
          @boundary_mm = normalize_loop(boundary_mm).freeze
          @pitch_degrees = Float(pitch_degrees)
          @truss_spacing_mm = Float(truss_spacing_mm)
          @purlin_spacing_mm = Float(purlin_spacing_mm)
          @overhang_mm = Float(overhang_mm)
          @type = type.to_sym
          freeze
        end

        def valid?
          errors.empty?
        end

        def errors
          result = []
          result << 'boundary requires at least three points' if boundary_mm.length < 3
          result << 'pitch must be greater than zero' unless pitch_degrees > 0
          result << 'truss spacing must be greater than zero' unless truss_spacing_mm.positive?
          result << 'purlin spacing must be greater than zero' unless purlin_spacing_mm.positive?
          result << 'overhang cannot be negative' if overhang_mm < 0
          result.freeze
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'boundary_mm' => boundary_mm,
            'pitch_degrees' => pitch_degrees,
            'truss_spacing_mm' => truss_spacing_mm,
            'purlin_spacing_mm' => purlin_spacing_mm,
            'overhang_mm' => overhang_mm,
            'type' => type.to_s
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            boundary_mm: data['boundary_mm'] || data[:boundary_mm] || [],
            pitch_degrees: data['pitch_degrees'] || data[:pitch_degrees] || 30.0,
            truss_spacing_mm: data['truss_spacing_mm'] || data[:truss_spacing_mm] || 1000.0,
            purlin_spacing_mm: data['purlin_spacing_mm'] || data[:purlin_spacing_mm] || 300.0,
            overhang_mm: data['overhang_mm'] || data[:overhang_mm] || 600.0,
            type: (data['type'] || data[:type] || :gable).to_sym
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
