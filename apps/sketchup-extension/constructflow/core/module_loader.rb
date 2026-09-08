# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class ModuleLoader
        def initialize(registry:, diagnostics: nil)
          @registry = registry
          @diagnostics = diagnostics
        end

        def load(manifest)
          @registry.register(manifest: manifest)
        end

        def load_all(manifests)
          snapshot = @registry.snapshot
          pending = Array(manifests).map(&:dup)
          loaded = []

          until pending.empty?
            progress = false
            pending.dup.each do |manifest|
              requirements = Array(manifest[:requires] || manifest['requires']).map(&:to_s)
              next unless requirements.all? { |dependency| @registry.registered?(dependency) }

              loaded << @registry.register(manifest: manifest)
              pending.delete(manifest)
              progress = true
            end

            next if progress

            unresolved = pending.map do |manifest|
              id = manifest[:id] || manifest['id']
              requires = Array(manifest[:requires] || manifest['requires'])
              "#{id} requires [#{requires.join(', ')}]"
            end
            raise ModuleRegistry::ManifestError, "unresolved or circular module dependencies: #{unresolved.join('; ')}"
          end

          loaded.freeze
        rescue StandardError => error
          @registry.restore(snapshot)
          @diagnostics&.error('module_batch_load_failed', error.message)
          raise
        end
      end
    end
  end
end
