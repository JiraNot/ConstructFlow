# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      class ExtensionDefinition
        SCHEMA_VERSION = 1
        PROGRAMS = %w[custom kitchen carport multipurpose laundry terrace pergola glass_room side rear].freeze
        MODES = %w[concept construction].freeze

        attr_reader :boundary_mm, :program, :base_level_id, :base_offset_mm,
                    :target_height_mm, :roof_intent, :mode, :attachment_host_id

        def initialize(boundary_mm:, program: 'custom', base_level_id: nil, base_offset_mm: 0,
                       target_height_mm: 2800, roof_intent: 'lean_to', mode: 'concept',
                       attachment_host_id: nil)
          @boundary_mm = normalize_boundary(boundary_mm).freeze
          @program = program.to_s
          @base_level_id = base_level_id&.to_s
          @base_offset_mm = Float(base_offset_mm)
          @target_height_mm = Float(target_height_mm)
          @roof_intent = roof_intent.to_s
          @mode = mode.to_s
          @attachment_host_id = attachment_host_id&.to_s
          freeze
        end

        def errors
          result = []
          result << 'extension boundary requires at least three points' if boundary_mm.length < 3
          result << 'extension program is unsupported' unless PROGRAMS.include?(program)
          result << 'extension mode is unsupported' unless MODES.include?(mode)
          result << 'target height must be greater than zero' unless target_height_mm.positive?
          result << 'extension boundary area must be greater than zero' if boundary_mm.length >= 3 && area_mm2 <= 1.0
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def area_mm2
          return 0.0 if boundary_mm.length < 3

          sum = boundary_mm.each_with_index.sum do |point, index|
            nxt = boundary_mm[(index + 1) % boundary_mm.length]
            (point[0] * nxt[1]) - (nxt[0] * point[1])
          end
          sum.abs / 2.0
        end

        def perimeter_mm
          return 0.0 if boundary_mm.length < 2

          boundary_mm.each_with_index.sum do |point, index|
            nxt = boundary_mm[(index + 1) % boundary_mm.length]
            dx = nxt[0] - point[0]
            dy = nxt[1] - point[1]
            dz = nxt[2] - point[2]
            Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
          end
        end

        def with(boundary_mm: self.boundary_mm, program: self.program,
                 base_level_id: self.base_level_id, base_offset_mm: self.base_offset_mm,
                 target_height_mm: self.target_height_mm, roof_intent: self.roof_intent,
                 mode: self.mode, attachment_host_id: self.attachment_host_id)
          self.class.new(
            boundary_mm: boundary_mm,
            program: program,
            base_level_id: base_level_id,
            base_offset_mm: base_offset_mm,
            target_height_mm: target_height_mm,
            roof_intent: roof_intent,
            mode: mode,
            attachment_host_id: attachment_host_id
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'boundary_mm' => boundary_mm,
            'program' => program,
            'base_level_id' => base_level_id,
            'base_offset_mm' => base_offset_mm,
            'target_height_mm' => target_height_mm,
            'roof_intent' => roof_intent,
            'mode' => mode,
            'attachment_host_id' => attachment_host_id
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            boundary_mm: data['boundary_mm'] || data[:boundary_mm] || [],
            program: data['program'] || data[:program] || 'custom',
            base_level_id: data['base_level_id'] || data[:base_level_id],
            base_offset_mm: data['base_offset_mm'] || data[:base_offset_mm] || 0,
            target_height_mm: data['target_height_mm'] || data[:target_height_mm] || 2800,
            roof_intent: data['roof_intent'] || data[:roof_intent] || 'lean_to',
            mode: data['mode'] || data[:mode] || 'concept',
            attachment_host_id: data['attachment_host_id'] || data[:attachment_host_id]
          )
        end

        private

        def normalize_boundary(values)
          Array(values).map do |point|
            item = Array(point)
            raise ArgumentError, 'extension boundary point requires x, y, z' unless item.length >= 3

            [Float(item[0]), Float(item[1]), Float(item[2])].freeze
          end
        end
      end
    end
  end
end
