# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class SketchupNativeCopyIdentityEntitiesObserver < Sketchup::EntitiesObserver
        def initialize(runtime:, repair:, on_container_added: nil)
          @runtime = runtime
          @repair = repair
          @on_container_added = on_container_added
          @pending = {}
        end

        def onElementAdded(_entities, entity)
          @on_container_added&.call(entity)
          schedule(entity)
        rescue StandardError => error
          @runtime.diagnostics&.error(
            'native_copy_observer_failed',
            "Native copy observer failed: #{error.message}",
            error_class: error.class.name
          )
        end

        private

        def schedule(entity)
          key = entity.object_id
          return if @pending[key]

          @pending[key] = true
          callback = proc do
            begin
              next unless entity_alive?(entity)
              next unless @repair.needs_repair?(entity)

              transaction_manager = @runtime.commands.transaction_manager
              results = if transaction_manager
                          transaction_manager.run('ConstructFlow: Repair Native Copy Identity', transparent: true) do
                            @repair.repair_tree(entity)
                          end
                        else
                          @repair.repair_tree(entity)
                        end
              next if results.empty?

              @runtime.events.publish(
                'NativeCopyIdentityRepaired',
                { repairs: results },
                source_module: 'constructflow.core',
                object_ids: results.map { |item| item['new_object_id'] }
              )
            rescue StandardError => error
              @runtime.diagnostics&.error(
                'native_copy_repair_failed',
                "Native copy identity repair failed: #{error.message}",
                error_class: error.class.name
              )
            ensure
              @pending.delete(key)
            end
          end

          if defined?(UI) && UI.respond_to?(:start_timer)
            UI.start_timer(0, false, &callback)
          else
            callback.call
          end
        end

        def entity_alive?(entity)
          return false if entity.respond_to?(:deleted?) && entity.deleted?
          return false if entity.respond_to?(:valid?) && !entity.valid?

          true
        end
      end

      class SketchupNativeCopyIdentityAppObserver < Sketchup::AppObserver
        def initialize(&callback)
          @callback = callback
        end

        def onNewModel(model)
          defer(model)
        end

        def onOpenModel(model)
          defer(model)
        end

        private

        def defer(model)
          if defined?(UI) && UI.respond_to?(:start_timer)
            UI.start_timer(0, false) { @callback&.call(model) }
          else
            @callback&.call(model)
          end
        end
      end
    end
  end
end
