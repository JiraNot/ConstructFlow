# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      class BorderDefinition
        SCHEMA_VERSION = 1
        OFFSETS = %w[inside center outside].freeze
        CORNERS = %w[miter butt radial custom].freeze

        attr_reader :surface_object_id, :width_mm, :material_id, :offset_mode,
                    :corner_treatment, :order, :follow_holes

        def initialize(surface_object_id:, width_mm:, material_id: 'generic.border',
                       offset_mode: 'inside', corner_treatment: 'miter', order: 0,
                       follow_holes: false)
          @surface_object_id = surface_object_id.to_s
          @width_mm = Float(width_mm)
          @material_id = material_id.to_s
          @offset_mode = offset_mode.to_s
          @corner_treatment = corner_treatment.to_s
          @order = Integer(order)
          @follow_holes = !!follow_holes
          freeze
        end

        def errors
          result = []
          result << 'surface object id required' if surface_object_id.empty?
          result << 'border width must be greater than zero' unless width_mm.positive?
          result << 'unsupported border offset mode' unless OFFSETS.include?(offset_mode)
          result << 'unsupported border corner treatment' unless CORNERS.include?(corner_treatment)
          result << 'border order cannot be negative' if order.negative?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def approximate_area_mm2(surface_definition)
          perimeter = surface_definition.perimeter_mm
          perimeter += surface_definition.hole_perimeter_mm if follow_holes
          perimeter * width_mm
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'surface_object_id' => surface_object_id,
            'width_mm' => width_mm,
            'material_id' => material_id,
            'offset_mode' => offset_mode,
            'corner_treatment' => corner_treatment,
            'order' => order,
            'follow_holes' => follow_holes
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            surface_object_id: data['surface_object_id'] || data[:surface_object_id],
            width_mm: data['width_mm'] || data[:width_mm] || 100,
            material_id: data['material_id'] || data[:material_id] || 'generic.border',
            offset_mode: data['offset_mode'] || data[:offset_mode] || 'inside',
            corner_treatment: data['corner_treatment'] || data[:corner_treatment] || 'miter',
            order: data['order'] || data[:order] || 0,
            follow_holes: data.key?('follow_holes') ? data['follow_holes'] : (data[:follow_holes] || false)
          )
        end
      end
    end
  end
end
