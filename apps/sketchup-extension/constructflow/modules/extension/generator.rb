# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      # Converts an extension zone into explicit domain intents.
      # It deliberately does not create geometry owned by other modules.
      class Generator
        DEFAULTS = {
          structure: { enabled: true, foundation: 'auto' },
          surface: { enabled: true, floor: 'auto' },
          roof: { enabled: true, system: 'from_extension' },
          drainage: { enabled: true, rainwater: true, surface_drainage: true },
          electrical: { enabled: true },
          interior: { enabled: true }
        }.freeze

        def initialize(definition)
          @definition = definition
        end

        def intents(options = {})
          settings = deep_merge(DEFAULTS, symbolize_keys(options))
          {
            extension_id: options[:extension_id] || options['extension_id'],
            program: @definition.program,
            mode: @definition.mode,
            boundary_mm: @definition.boundary_mm,
            base_level_id: @definition.base_level_id,
            target_height_mm: @definition.target_height_mm,
            roof_intent: @definition.roof_intent,
            attachment_host_id: @definition.attachment_host_id,
            domains: settings
          }
        end

        private

        def symbolize_keys(value)
          return value unless value.is_a?(Hash)

          value.each_with_object({}) do |(key, item), result|
            result[key.to_sym] = symbolize_keys(item)
          end
        end

        def deep_merge(base, override)
          base.each_with_object({}) do |(key, value), result|
            replacement = override[key]
            result[key] = if value.is_a?(Hash) && replacement.is_a?(Hash)
                            deep_merge(value, replacement)
                          elsif override.key?(key)
                            replacement
                          else
                            value
                          end
          end
        end
      end
    end
  end
end
