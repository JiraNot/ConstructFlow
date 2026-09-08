# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class ManholeDefinition
        SCHEMA_VERSION = 1
        DEFAULT_SIZE_MM = [600.0, 600.0].freeze

        attr_reader :location_mm, :size_mm, :cover_level_mm, :invert_in_mm,
                    :invert_out_mm, :manhole_type, :inlet_connector_id,
                    :outlet_connector_id

        def initialize(location_mm:, size_mm: DEFAULT_SIZE_MM, cover_level_mm: nil,
                       invert_in_mm: nil, invert_out_mm: nil, manhole_type: 'generic',
                       inlet_connector_id: nil, outlet_connector_id: nil)
          @location_mm = normalize_point(location_mm).freeze
          @size_mm = normalize_size(size_mm).freeze
          @cover_level_mm = optional_float(cover_level_mm)
          @invert_in_mm = optional_float(invert_in_mm)
          @invert_out_mm = optional_float(invert_out_mm)
          @manhole_type = manhole_type.to_s
          @inlet_connector_id = inlet_connector_id&.to_s
          @outlet_connector_id = outlet_connector_id&.to_s
          freeze
        end

        def errors
          result = []
          result << 'manhole width must be greater than zero' unless size_mm[0].positive?
          result << 'manhole length must be greater than zero' unless size_mm[1].positive?
          if cover_level_mm && invert_in_mm && invert_in_mm > cover_level_mm
            result << 'manhole inlet invert cannot be above cover level'
          end
          if cover_level_mm && invert_out_mm && invert_out_mm > cover_level_mm
            result << 'manhole outlet invert cannot be above cover level'
          end
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def depth_mm
          return nil if cover_level_mm.nil?

          lowest = [invert_in_mm, invert_out_mm].compact.min
          lowest.nil? ? nil : cover_level_mm - lowest
        end

        def with(location_mm: self.location_mm, size_mm: self.size_mm,
                 cover_level_mm: self.cover_level_mm, invert_in_mm: self.invert_in_mm,
                 invert_out_mm: self.invert_out_mm, manhole_type: self.manhole_type,
                 inlet_connector_id: self.inlet_connector_id,
                 outlet_connector_id: self.outlet_connector_id)
          self.class.new(
            location_mm: location_mm,
            size_mm: size_mm,
            cover_level_mm: cover_level_mm,
            invert_in_mm: invert_in_mm,
            invert_out_mm: invert_out_mm,
            manhole_type: manhole_type,
            inlet_connector_id: inlet_connector_id,
            outlet_connector_id: outlet_connector_id
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'location_mm' => location_mm,
            'size_mm' => size_mm,
            'cover_level_mm' => cover_level_mm,
            'invert_in_mm' => invert_in_mm,
            'invert_out_mm' => invert_out_mm,
            'manhole_type' => manhole_type,
            'inlet_connector_id' => inlet_connector_id,
            'outlet_connector_id' => outlet_connector_id
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            location_mm: data['location_mm'] || data[:location_mm] || [0, 0, 0],
            size_mm: data['size_mm'] || data[:size_mm] || DEFAULT_SIZE_MM,
            cover_level_mm: data['cover_level_mm'] || data[:cover_level_mm],
            invert_in_mm: data['invert_in_mm'] || data[:invert_in_mm],
            invert_out_mm: data['invert_out_mm'] || data[:invert_out_mm],
            manhole_type: data['manhole_type'] || data[:manhole_type] || 'generic',
            inlet_connector_id: data['inlet_connector_id'] || data[:inlet_connector_id],
            outlet_connector_id: data['outlet_connector_id'] || data[:outlet_connector_id]
          )
        end

        private

        def normalize_point(value)
          values = Array(value)
          raise ArgumentError, 'manhole location requires x, y, z' unless values.length >= 3

          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

        def normalize_size(value)
          values = Array(value)
          raise ArgumentError, 'manhole size requires width and length' unless values.length >= 2

          [Float(values[0]), Float(values[1])]
        end

        def optional_float(value)
          value.nil? || value == '' ? nil : Float(value)
        end
      end
    end
  end
end
