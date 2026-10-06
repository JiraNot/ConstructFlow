# frozen_string_literal: true

require_relative 'module_definition'

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

        def load_module_definitions(definitions, runtime)
          pending = Array(definitions).map do |defn|
            defn.is_a?(ModuleDefinition) ? defn : ModuleDefinition.new(**defn)
          end
          ordered_definitions = []

          until pending.empty?
            progress = false
            pending.dup.each do |defn|
              next unless defn.requires.all? { |dep| @registry.registered?(dep) }

              unless @registry.registered?(defn.id)
                defn.installer&.call(runtime)
                @registry.register(manifest: defn.manifest) unless @registry.registered?(defn.id)
              end

              ordered_definitions << defn
              pending.delete(defn)
              progress = true
            end

            next if progress

            unresolved = pending.map do |defn|
              "#{defn.id} requires [#{defn.requires.join(', ')}]"
            end
            raise ModuleRegistry::ManifestError, "unresolved or circular module dependencies: #{unresolved.join('; ')}"
          end

          # Phase 2: Run cross-domain integrations once all module capabilities are published
          ordered_definitions.each do |defn|
            defn.integrations.each { |integration| integration.call(runtime) }
          end

          ordered_definitions.map(&:id).freeze
        rescue StandardError => error
          @diagnostics&.error('module_definitions_load_failed', error.message)
          raise
        end
      end
    end
  end
end
