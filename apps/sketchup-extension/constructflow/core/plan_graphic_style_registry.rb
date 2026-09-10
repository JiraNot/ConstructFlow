# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class PlanGraphicStyleRegistry
        DEFAULT_STYLE = {
          'style_id' => 'default',
          'stroke_pattern' => 'solid',
          'line_weight' => 'normal',
          'color_key' => 'foreground',
          'emphasis' => 'normal'
        }.freeze

        def initialize
          @role_styles = {}
          @phase_styles = {}
          @status_styles = {}
        end

        def register_role(role, style)
          register(@role_styles, role, style)
        end

        def register_phase(phase, style)
          register(@phase_styles, phase, style)
        end

        def register_status(status, style)
          register(@status_styles, status, style)
        end

        def resolve(item:, representation:)
          item = stringify_keys(item || {})
          representation = stringify_keys(representation || {})
          style = DEFAULT_STYLE.dup

          role = item['style_role'].to_s
          style.merge!(@role_styles[role]) if @role_styles.key?(role)

          # A representation primitive may describe a phase-specific construction
          # action without changing the source Smart Object lifecycle. This is used
          # for partial modifications such as a new Opening that represents a
          # demolition cut through an Existing host wall in a demolition view.
          phase_key = item['lifecycle_role'].to_s
          phase_key = lifecycle_style_key(representation) if phase_key.empty?
          style.merge!(@phase_styles[phase_key]) if @phase_styles.key?(phase_key)

          status = item['status'].to_s
          style.merge!(@status_styles[status]) if @status_styles.key?(status)
          style.freeze
        end

        private

        def register(target, key, style)
          key = key.to_s
          raise ArgumentError, 'style key required' if key.empty?
          raise ArgumentError, "style already registered: #{key}" if target.key?(key)

          target[key] = stringify_keys(style || {}).freeze
        end

        def lifecycle_style_key(representation)
          lifecycle = representation['source_lifecycle'] || {}
          return 'demolition' if lifecycle['removed_phase'].to_s == 'demolition'
          return 'new_construction' if lifecycle['created_phase'].to_s == 'new_construction'
          return 'existing' if lifecycle['created_phase'].to_s == 'existing'

          ''
        end

        def stringify_keys(value)
          case value
          when Hash
            value.each_with_object({}) { |(key, item), result| result[key.to_s] = stringify_keys(item) }
          when Array
            value.map { |item| stringify_keys(item) }
          else
            value
          end
        end
      end
    end
  end
end
