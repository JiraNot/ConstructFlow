# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      class PatternDefinition
        SCHEMA_VERSION = 1
        PATTERNS = %w[grid running_bond herringbone basket_weave chevron diagonal modular european_fan radial concentric follow_path custom].freeze
        LAYOUT_STATES = %w[preview locked].freeze

        attr_reader :surface_object_id, :pattern, :origin_mm, :angle_deg,
                    :module_mm, :joint_mm, :minimum_cut_mm, :alignment,
                    :layout_state

        def initialize(surface_object_id:, pattern: 'grid', origin_mm: [0, 0, 0],
                       angle_deg: 0, module_mm: [300, 300], joint_mm: 3,
                       minimum_cut_mm: 50, alignment: 'custom', layout_state: 'preview')
          @surface_object_id = surface_object_id.to_s
          @pattern = pattern.to_s
          @origin_mm = normalize_point(origin_mm).freeze
          @angle_deg = Float(angle_deg)
          @module_mm = normalize_module(module_mm).freeze
          @joint_mm = Float(joint_mm)
          @minimum_cut_mm = Float(minimum_cut_mm)
          @alignment = alignment.to_s
          @layout_state = layout_state.to_s
          freeze
        end

        def errors
          result = []
          result << 'surface object id required' if surface_object_id.empty?
          result << 'unsupported paving pattern' unless PATTERNS.include?(pattern)
          result << 'module width must be greater than zero' unless module_mm[0].positive?
          result << 'module height must be greater than zero' unless module_mm[1].positive?
          result << 'joint width cannot be negative' if joint_mm.negative?
          result << 'minimum cut cannot be negative' if minimum_cut_mm.negative?
          result << 'unsupported layout state' unless LAYOUT_STATES.include?(layout_state)
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def effective_module_area_mm2
          (module_mm[0] + joint_mm) * (module_mm[1] + joint_mm)
        end

        def basis
          radians = angle_deg * Math::PI / 180.0
          primary = [Math.cos(radians), Math.sin(radians)].freeze
          secondary = [-Math.sin(radians), Math.cos(radians)].freeze
          { primary: primary, secondary: secondary }.freeze
        end

        def provisional_piece_count(net_area_mm2)
          return 0 if effective_module_area_mm2 <= 0
          (Float(net_area_mm2) / effective_module_area_mm2).ceil
        end

        def with(surface_object_id: self.surface_object_id, pattern: self.pattern,
                 origin_mm: self.origin_mm, angle_deg: self.angle_deg,
                 module_mm: self.module_mm, joint_mm: self.joint_mm,
                 minimum_cut_mm: self.minimum_cut_mm, alignment: self.alignment,
                 layout_state: self.layout_state)
          self.class.new(
            surface_object_id: surface_object_id,
            pattern: pattern,
            origin_mm: origin_mm,
            angle_deg: angle_deg,
            module_mm: module_mm,
            joint_mm: joint_mm,
            minimum_cut_mm: minimum_cut_mm,
            alignment: alignment,
            layout_state: layout_state
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'surface_object_id' => surface_object_id,
            'pattern' => pattern,
            'origin_mm' => origin_mm,
            'angle_deg' => angle_deg,
            'module_mm' => module_mm,
            'joint_mm' => joint_mm,
            'minimum_cut_mm' => minimum_cut_mm,
            'alignment' => alignment,
            'layout_state' => layout_state
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            surface_object_id: data['surface_object_id'] || data[:surface_object_id],
            pattern: data['pattern'] || data[:pattern] || 'grid',
            origin_mm: data['origin_mm'] || data[:origin_mm] || [0, 0, 0],
            angle_deg: data['angle_deg'] || data[:angle_deg] || 0,
            module_mm: data['module_mm'] || data[:module_mm] || [300, 300],
            joint_mm: data['joint_mm'] || data[:joint_mm] || 3,
            minimum_cut_mm: data['minimum_cut_mm'] || data[:minimum_cut_mm] || 50,
            alignment: data['alignment'] || data[:alignment] || 'custom',
            layout_state: data['layout_state'] || data[:layout_state] || 'preview'
          )
        end

        private

        def normalize_point(value)
          values = Array(value)
          raise ArgumentError, 'pattern origin requires x, y, z' unless values.length >= 3
          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

        def normalize_module(value)
          values = Array(value)
          raise ArgumentError, 'pattern module requires width and height' unless values.length >= 2
          [Float(values[0]), Float(values[1])]
        end
      end
    end
  end
end
