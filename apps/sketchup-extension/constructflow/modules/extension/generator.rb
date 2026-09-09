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
          raise ArgumentError, 'extension definition is required' unless definition

          @definition = definition
        end

        def intents(options = {})
          options = symbolize_keys(options)
          overrides = options.fetch(:domains, {})
          settings = deep_merge(DEFAULTS, overrides)
          {
            extension_id: options[:extension_id],
            program: @definition.program,
            mode: @definition.mode,
            boundary_mm: @definition.boundary_mm,
            base_level_id: @definition.base_level_id,
            base_offset_mm: @definition.base_offset_mm,
            target_height_mm: @definition.target_height_mm,
            roof_intent: @definition.roof_intent,
            attachment_host_id: @definition.attachment_host_id,
            domains: settings
          }.freeze
        end

        def enabled_domains(options = {})
          intents(options)[:domains].each_with_object([]) do |(domain, config), result|
            result << domain.to_s if config.is_a?(Hash) && config[:enabled]
          end.freeze
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
