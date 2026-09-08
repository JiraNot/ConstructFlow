# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class ModuleRegistry
        def initialize
          @modules = {}
        end

        def register(module_id, manifest:)
          key = normalize_id(module_id)
          raise ArgumentError, "module already registered: #{key}" if @modules.key?(key)

          @modules[key] = {
            id: key,
            manifest: manifest.freeze
          }.freeze
        end

        def unregister(module_id)
          @modules.delete(normalize_id(module_id))
        end

        def registered?(module_id)
          @modules.key?(normalize_id(module_id))
        end

        def fetch(module_id)
          @modules.fetch(normalize_id(module_id))
        end

        def each(&block)
          @modules.values.each(&block)
        end

        def size
          @modules.size
        end

        private

        def normalize_id(value)
          value.to_s.strip.downcase
        end
      end
    end
  end
end
