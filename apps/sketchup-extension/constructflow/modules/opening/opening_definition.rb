# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Opening
      class OpeningDefinition
        SCHEMA_VERSION = 1
        DEFAULT_WIDTH_MM = 900.0
        DEFAULT_HEIGHT_MM = 2100.0
        DEFAULT_SILL_MM = 0.0

        attr_reader :host_object_id, :shape, :segment_index, :start_offset_mm,
                    :width_mm, :height_mm, :sill_mm

        def initialize(host_object_id:, segment_index:, start_offset_mm:, width_mm: DEFAULT_WIDTH_MM,
                       height_mm: DEFAULT_HEIGHT_MM, sill_mm: DEFAULT_SILL_MM,
                       shape: 'rectangular')
          @host_object_id = host_object_id.to_s
          @shape = shape.to_s
          @segment_index = Integer(segment_index)
          @start_offset_mm = Float(start_offset_mm)
          @width_mm = Float(width_mm)
          @height_mm = Float(height_mm)
          @sill_mm = Float(sill_mm)
          freeze
        end

        def errors
          result = []
          result << 'opening host object id required' if host_object_id.strip.empty?
          result << 'only rectangular opening is implemented in v1' unless shape == 'rectangular'
          result << 'opening segment index must be zero or greater' if segment_index.negative?
          result << 'opening start offset must be zero or greater' if start_offset_mm.negative?
          result << 'opening width must be greater than zero' unless width_mm.positive?
          result << 'opening height must be greater than zero' unless height_mm.positive?
          result << 'opening sill must be zero or greater' if sill_mm.negative?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def area_mm2
          width_mm * height_mm
        end

        def top_mm
          sill_mm + height_mm
        end

        def end_offset_mm
          start_offset_mm + width_mm
        end

        def host_descriptor(opening_id: nil)
          {
            'opening_id' => opening_id.to_s,
            'segment_index' => segment_index,
            'start_offset_mm' => start_offset_mm,
            'width_mm' => width_mm,
            'height_mm' => height_mm,
            'sill_mm' => sill_mm
          }
        end

        def with(host_object_id: self.host_object_id, segment_index: self.segment_index,
                 start_offset_mm: self.start_offset_mm, width_mm: self.width_mm,
                 height_mm: self.height_mm, sill_mm: self.sill_mm, shape: self.shape)
          self.class.new(
            host_object_id: host_object_id,
            segment_index: segment_index,
            start_offset_mm: start_offset_mm,
            width_mm: width_mm,
            height_mm: height_mm,
            sill_mm: sill_mm,
            shape: shape
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'host_object_id' => host_object_id,
            'shape' => shape,
            'segment_index' => segment_index,
            'start_offset_mm' => start_offset_mm,
            'width_mm' => width_mm,
            'height_mm' => height_mm,
            'sill_mm' => sill_mm
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            host_object_id: data['host_object_id'] || data[:host_object_id],
            shape: data['shape'] || data[:shape] || 'rectangular',
            segment_index: data['segment_index'] || data[:segment_index] || 0,
            start_offset_mm: data['start_offset_mm'] || data[:start_offset_mm] || 0,
            width_mm: data['width_mm'] || data[:width_mm] || DEFAULT_WIDTH_MM,
            height_mm: data['height_mm'] || data[:height_mm] || DEFAULT_HEIGHT_MM,
            sill_mm: data['sill_mm'] || data[:sill_mm] || DEFAULT_SILL_MM
          )
        end
      end
    end
  end
end
