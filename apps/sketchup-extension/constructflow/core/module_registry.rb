# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class ModuleRegistry
        class ManifestError < ArgumentError; end

        REQUIRED_FIELDS = %w[id name version schema_version].freeze
        ARRAY_FIELDS = %w[requires optional_capabilities provides objects commands events providers validators].freeze

        def initialize(diagnostics: nil)
          @diagnostics = diagnostics
          @modules = {}
          @capabilities = {}
        end

        def register(module_id = nil, manifest:)
          normalized = normalize_manifest(manifest)
          normalized['id'] = normalize_id(module_id) if module_id
          validate_manifest!(normalized)

          key = normalized['id']
          raise ManifestError, "module already registered: #{key}" if @modules.key?(key)

          missing_dependencies = normalized['requires'].reject { |dependency| @modules.key?(dependency) }
          unless missing_dependencies.empty?
            raise ManifestError, "missing required dependencies for #{key}: #{missing_dependencies.join(', ')}"
          end

          provided = normalized['provides']
          collisions = provided.select { |capability| @capabilities.key?(capability) }
          unless collisions.empty?
            raise ManifestError, "capability already provided: #{collisions.join(', ')}"
          end

          record = { id: key, manifest: deep_freeze(normalized) }.freeze
          @modules[key] = record
          provided.each { |capability| @capabilities[capability] = key }
          record
        rescue StandardError => error
          @diagnostics&.error('module_registration_failed', error.message, module_id: module_id || manifest_id(manifest))
          raise
        end

        def unregister(module_id)
          key = normalize_id(module_id)
          record = @modules.delete(key)
          return nil unless record

          record[:manifest]['provides'].each do |capability|
            @capabilities.delete(capability) if @capabilities[capability] == key
          end
          record
        end

        def registered?(module_id)
          @modules.key?(normalize_id(module_id))
        end

        def fetch(module_id)
          @modules.fetch(normalize_id(module_id))
        end

        def each(&block)
          return enum_for(:each) unless block

          @modules.values.each(&block)
        end

        def size
          @modules.size
        end

        def registered_ids
          @modules.keys.sort.freeze
        end

        def capability_owner(capability)
          @capabilities[capability.to_s]
        end

        def capability_available?(capability)
          @capabilities.key?(capability.to_s)
        end

        def snapshot
          {
            modules: @modules.dup,
            capabilities: @capabilities.dup
          }
        end

        def restore(snapshot)
          @modules = snapshot.fetch(:modules).dup
          @capabilities = snapshot.fetch(:capabilities).dup
          self
        end

        def validate_manifest!(manifest)
          missing = REQUIRED_FIELDS.select { |field| blank?(manifest[field]) }
          raise ManifestError, "manifest missing fields: #{missing.join(', ')}" unless missing.empty?

          id = normalize_id(manifest['id'])
          unless id.match?(/\Aconstructflow\.[a-z0-9_]+(?:[.-][a-z0-9_]+)*\z/)
            raise ManifestError, "invalid module id: #{id}"
          end

          Integer(manifest['schema_version'])
          ARRAY_FIELDS.each do |field|
            raise ManifestError, "manifest #{field} must be an Array" unless manifest[field].is_a?(Array)
          end

          manifest['requires'].each do |dependency|
            normalized = normalize_id(dependency)
            raise ManifestError, "module cannot require itself: #{id}" if normalized == id
          end
          true
        rescue ArgumentError => error
          raise ManifestError, error.message
        end

        private

        def normalize_manifest(manifest)
          raise ManifestError, 'manifest must be a Hash' unless manifest.is_a?(Hash)

          normalized = {}
          manifest.each { |key, value| normalized[key.to_s] = value }
          ARRAY_FIELDS.each { |field| normalized[field] = Array(normalized[field]).map(&:to_s) }
          normalized['id'] = normalize_id(normalized['id']) unless blank?(normalized['id'])
          normalized['schema_version'] = Integer(normalized['schema_version']) unless blank?(normalized['schema_version'])
          normalized
        end

        def normalize_id(value)
          value.to_s.strip.downcase
        end

        def manifest_id(manifest)
          manifest.is_a?(Hash) ? (manifest[:id] || manifest['id']) : nil
        end

        def blank?(value)
          value.nil? || (value.respond_to?(:empty?) && value.empty?)
        end

        def deep_freeze(value)
          case value
          when Hash
            value.each { |key, item| deep_freeze(key); deep_freeze(item) }
          when Array
            value.each { |item| deep_freeze(item) }
          end
          value.freeze
        end
      end
    end
  end
end
