# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class SketchupNativeGraphicStyleAdapter
        DICTIONARY = 'constructflow.native_graphic_style'
        TAG_PREFIX = 'CF-STYLE'

        COLOR_RGB = {
          'foreground' => [40, 40, 40],
          'waste' => [70, 70, 70],
          'soil' => [95, 72, 55],
          'rainwater' => [60, 110, 155],
          'drainage_node' => [40, 40, 40],
          'existing' => [150, 150, 150],
          'new_work' => [25, 25, 25],
          'demolition' => [180, 60, 60],
          'verify' => [205, 135, 40]
        }.freeze

        PATTERN_ALIASES = {
          'dash' => %w[dash dashed shortdash longdash],
          'dash_dot' => %w[dashdot dash-dot dotdash center],
          'dot' => %w[dot dotted]
        }.freeze

        def apply(entity:, style:, model:)
          return false unless entity && model

          style = stringify_keys(style || {})
          tag = ensure_style_tag(model, style)
          entity.layer = tag if tag && entity.respond_to?(:layer=)

          applied_line_style = apply_line_style(model, tag, style['stroke_pattern']) if tag
          rgb = apply_tag_color(tag, style['color_key']) if tag
          tag.visible = true if tag && tag.respond_to?(:visible=)

          persist_native_metadata(entity, tag, applied_line_style, rgb, style)
          true
        rescue StandardError
          false
        end

        private

        def ensure_style_tag(model, style)
          return nil unless model.respond_to?(:layers)

          layers = model.layers
          key = [style['color_key'], style['stroke_pattern'], style['emphasis']]
                .map { |value| slug(value) }.reject(&:empty?).join('-')
          name = "#{TAG_PREFIX}-#{key.empty? ? 'DEFAULT' : key.upcase}"
          tag = layers[name] if layers.respond_to?(:[])
          tag ||= layers.add(name) if layers.respond_to?(:add)
          tag
        end

        def apply_line_style(model, tag, pattern)
          return nil unless tag.respond_to?(:line_style=)
          return nil if pattern.to_s.empty? || pattern.to_s == 'solid'
          return nil unless model.respond_to?(:line_styles)

          line_style = find_line_style(model.line_styles, pattern)
          tag.line_style = line_style if line_style
          line_style
        end

        def find_line_style(collection, pattern)
          aliases = PATTERN_ALIASES.fetch(pattern.to_s, [pattern.to_s])
          values = if collection.respond_to?(:to_a)
                     collection.to_a
                   elsif collection.respond_to?(:each)
                     collection.each.to_a
                   else
                     []
                   end
          values.find do |line_style|
            name = if line_style.respond_to?(:name)
                     line_style.name
                   elsif line_style.respond_to?(:display_name)
                     line_style.display_name
                   else
                     line_style.to_s
                   end
            normalized = slug(name)
            aliases.any? { |candidate| normalized.include?(slug(candidate)) }
          end
        end

        def apply_tag_color(tag, color_key)
          rgb = COLOR_RGB[color_key.to_s]
          return nil unless rgb && tag.respond_to?(:color=)

          color = if defined?(Sketchup::Color)
                    Sketchup::Color.new(*rgb)
                  else
                    rgb
                  end
          tag.color = color
          rgb
        end

        def persist_native_metadata(entity, tag, line_style, rgb, style)
          return unless entity.respond_to?(:set_attribute)

          entity.set_attribute(DICTIONARY, 'native_applied', true)
          entity.set_attribute(DICTIONARY, 'tag_name', tag_name(tag)) if tag
          entity.set_attribute(DICTIONARY, 'line_style', line_style_name(line_style)) if line_style
          entity.set_attribute(DICTIONARY, 'color_rgb', rgb.join(',')) if rgb
          entity.set_attribute(DICTIONARY, 'requested_line_weight', style['line_weight'].to_s)
          entity.set_attribute(DICTIONARY, 'requested_pattern', style['stroke_pattern'].to_s)
        end

        def tag_name(tag)
          tag.respond_to?(:name) ? tag.name.to_s : tag.to_s
        end

        def line_style_name(line_style)
          return '' unless line_style
          return line_style.name.to_s if line_style.respond_to?(:name)
          return line_style.display_name.to_s if line_style.respond_to?(:display_name)

          line_style.to_s
        end

        def slug(value)
          value.to_s.downcase.gsub(/[^a-z0-9]+/, '')
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
