# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      class ConstructionIntentStore
        DICTIONARY = 'constructflow.extension'
        KEY = 'construction_intent'
        SCHEMA_VERSION = 1
        DOMAINS = %w[architecture opening structure surface roof drainage interior electrical].freeze

        def read(entity)
          payload = Core::AttributeStore.new(entity).read_json(KEY, nil, dictionary: DICTIONARY)
          normalize_payload(payload)
        end

        def write(entity, domains:)
          payload = {
            'schema_version' => SCHEMA_VERSION,
            'domains' => normalize_domains(domains)
          }.freeze
          Core::AttributeStore.new(entity).write_json(KEY, payload, dictionary: DICTIONARY)
          payload
        end

        def update(entity, domains:, replace: false)
          incoming = normalize_domains(domains)
          merged = if replace
                     incoming
                   else
                     deep_merge(read(entity).fetch('domains'), incoming)
                   end
          write(entity, domains: merged)
        end

        def effective_domains(entity, overrides = {})
          deep_merge(read(entity).fetch('domains'), normalize_domains(overrides || {})).freeze
        end

        private

        def normalize_payload(payload)
          return empty_payload if payload.nil?
          data = stringify_keys(payload)
          version = Integer(data['schema_version'] || 1)
          raise ArgumentError, "unsupported construction intent schema version: #{version}" unless version == SCHEMA_VERSION

          {
            'schema_version' => SCHEMA_VERSION,
            'domains' => normalize_domains(data['domains'] || {})
          }.freeze
        rescue TypeError, ArgumentError => error
          raise ArgumentError, "invalid construction intent payload: #{error.message}"
        end

        def empty_payload
          { 'schema_version' => SCHEMA_VERSION, 'domains' => {}.freeze }.freeze
        end

        def normalize_domains(value)
          data = stringify_keys(value || {})
          unknown = data.keys - DOMAINS
          raise ArgumentError, "unknown construction intent domain(s): #{unknown.sort.join(', ')}" unless unknown.empty?

          data.each_with_object({}) do |(domain, config), result|
            raise ArgumentError, "construction intent #{domain} config must be a Hash" unless config.is_a?(Hash)
            result[domain] = stringify_keys(config).freeze
          end.freeze
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

        def deep_merge(base, override)
          keys = (base.keys + override.keys).uniq
          keys.each_with_object({}) do |key, result|
            left = base[key]
            right = override[key]
            result[key] = if left.is_a?(Hash) && right.is_a?(Hash)
                            deep_merge(left, right)
                          elsif override.key?(key)
                            right
                          else
                            left
                          end
          end
        end
      end
    end
  end
end
