# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class NativeCopyIdentityRuntimeIntegration
        def self.install(runtime)
          integration = new(runtime)
          integration.install
          integration
        end

        def initialize(runtime)
          @runtime = runtime
          @repair = NativeCopyIdentityRepair.new(runtime: runtime)
          @observed_collections = {}
          @entities_observers = []
        end

        def install
          attach_model(@runtime.active_model)
          install_app_observer
          install_runtime_accessor
          self
        end

        def attach_model(model)
          return unless model && model.respond_to?(:entities)
          return unless @runtime.active_model.equal?(model)

          # Keep observer instances strongly referenced for the lifetime of the
          # integration. SketchUp does not retain Ruby observers for us.
          attach_entities_collection(model.entities)
          self
        end

        private

        def install_runtime_accessor
          @runtime.singleton_class.class_eval do
            attr_accessor :native_copy_identity_guard unless method_defined?(:native_copy_identity_guard)
          end
          @runtime.native_copy_identity_guard = self
        end

        def install_app_observer
          @app_observer = SketchupNativeCopyIdentityAppObserver.new do |model|
            # Runtime's primary AppObserver was installed during boot. This
            # observer is registered later and defers once more before binding
            # so Runtime#attach_model can rebuild its SmartObjectManager first.
            deferred_attach(model)
          end
          Sketchup.add_observer(@app_observer)
        end

        def deferred_attach(model)
          callback = proc { attach_model(model) }
          if defined?(UI) && UI.respond_to?(:start_timer)
            UI.start_timer(0, false, &callback)
          else
            callback.call
          end
        end

        def attach_entities_collection(entities)
          return unless entities && entities.respond_to?(:add_observer)

          key = entities.object_id
          return if @observed_collections[key]

          observer = SketchupNativeCopyIdentityEntitiesObserver.new(
            runtime: @runtime,
            repair: @repair,
            on_container_added: method(:attach_child_collection)
          )
          entities.add_observer(observer)
          @observed_collections[key] = true
          @entities_observers << observer

          entities.each { |entity| attach_child_collection(entity) }
        rescue StandardError => error
          @runtime.diagnostics&.error(
            'native_copy_observer_attach_failed',
            "Failed to attach native copy observer: #{error.message}",
            error_class: error.class.name
          )
        end

        def attach_child_collection(entity)
          return unless entity.respond_to?(:entities)

          attach_entities_collection(entity.entities)
        rescue StandardError
          nil
        end
      end
    end
  end
end
