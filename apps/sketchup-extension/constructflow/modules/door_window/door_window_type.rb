# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      class DoorWindowType
        SCHEMA_VERSION = 1
        CATEGORIES = %w[door window].freeze
        OPERATIONS = %w[fixed sliding swing].freeze
        PANEL_STYLES = %w[glazed solid mixed].freeze
        FRAME_MATERIALS = %w[aluminium wood steel upvc generic].freeze

        attr_reader :id, :name, :category, :operation, :width_mm, :height_mm,
                    :frame_material, :frame_width_mm, :panel_roles, :panel_style

        def initialize(id:, name: nil, category:, operation:, width_mm:, height_mm:,
                       frame_material: 'aluminium', frame_width_mm: 50,
                       panel_roles: nil, panel_style: 'glazed')
          @id = id.to_s
          @name = (name || id).to_s
          @category = category.to_s
          @operation = operation.to_s
          @width_mm = Float(width_mm)
          @height_mm = Float(height_mm)
          @frame_material = frame_material.to_s
          @frame_width_mm = Float(frame_width_mm)
          @panel_roles = normalize_panel_roles(panel_roles || default_panel_roles(@operation)).freeze
          @panel_style = panel_style.to_s
          freeze
        end

        def errors
          result = []
          result << 'door/window type id required' if id.strip.empty?
          result << 'door/window category must be door or window' unless CATEGORIES.include?(category)
          result << 'unsupported door/window operation' unless OPERATIONS.include?(operation)
          result << 'door/window width must be greater than zero' unless width_mm.positive?
          result << 'door/window height must be greater than zero' unless height_mm.positive?
          result << 'frame width must be zero or greater' if frame_width_mm.negative?
          result << 'frame material is invalid' unless FRAME_MATERIALS.include?(frame_material)
          result << 'panel style is invalid' unless PANEL_STYLES.include?(panel_style)
          result << 'at least one panel role required' if panel_roles.empty?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def clear_width_mm
          [width_mm - (2.0 * frame_width_mm), 0.0].max
        end

        def clear_height_mm
          [height_mm - (2.0 * frame_width_mm), 0.0].max
        end

        def clear_area_mm2
          clear_width_mm * clear_height_mm
        end

        def parametric_parameters(instance_parameters: {})
          Core::ParametricObjectEngine.new(
            type_parameters: { 'width' => width_mm, 'height' => height_mm, 'frame' => frame_width_mm },
            formulas: {
              'clear_width' => 'width - (2 * frame)',
              'clear_height' => 'height - (2 * frame)',
              'clear_area' => 'clear_width * clear_height'
            }
          ).resolve(instance_parameters: instance_parameters)
        end

        def frame_perimeter_mm
          2.0 * (width_mm + height_mm)
        end

        def with(name: self.name, category: self.category, operation: self.operation,
                 width_mm: self.width_mm, height_mm: self.height_mm,
                 frame_material: self.frame_material, frame_width_mm: self.frame_width_mm,
                 panel_roles: self.panel_roles, panel_style: self.panel_style)
          self.class.new(
            id: id,
            name: name,
            category: category,
            operation: operation,
            width_mm: width_mm,
            height_mm: height_mm,
            frame_material: frame_material,
            frame_width_mm: frame_width_mm,
            panel_roles: panel_roles,
            panel_style: panel_style
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'id' => id,
            'name' => name,
            'category' => category,
            'operation' => operation,
            'width_mm' => width_mm,
            'height_mm' => height_mm,
            'frame_material' => frame_material,
            'frame_width_mm' => frame_width_mm,
            'panel_roles' => panel_roles,
            'panel_style' => panel_style
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            id: data['id'] || data[:id],
            name: data['name'] || data[:name],
            category: data['category'] || data[:category] || 'window',
            operation: data['operation'] || data[:operation] || 'fixed',
            width_mm: data['width_mm'] || data[:width_mm],
            height_mm: data['height_mm'] || data[:height_mm],
            frame_material: data['frame_material'] || data[:frame_material] || 'aluminium',
            frame_width_mm: data['frame_width_mm'] || data[:frame_width_mm] || 50,
            panel_roles: data['panel_roles'] || data[:panel_roles],
            panel_style: data['panel_style'] || data[:panel_style] || 'glazed'
          )
        end

        private

        def normalize_panel_roles(values)
          Array(values).map(&:to_s)
        end

        def default_panel_roles(operation)
          case operation.to_s
          when 'sliding' then %w[fixed slide_right]
          when 'swing' then ['swing_right']
          else ['fixed']
          end
        end
      end
    end
  end
end
