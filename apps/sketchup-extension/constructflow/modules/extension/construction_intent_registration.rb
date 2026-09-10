# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      module ConstructionIntentRegistration
        COMMAND = 'SetExtensionConstructionIntent'

        module_function

        def install(runtime)
          store = ConstructionIntentStore.new
          install_runtime_helper(runtime, store)
          return store if runtime.commands.registered?(COMMAND)

          runtime.commands.register(
            COMMAND,
            owner_module: 'constructflow.extension',
            validator: ->(command) { validation_errors(runtime, store, command[:input]) }
          ) do |command|
            input = command[:input]
            object = resolve_extension(runtime, input)
            payload = store.update(
              object.entity,
              domains: value(input, :domains) || {},
              replace: value(input, :replace) == true
            )
            runtime.smart_objects.mark_dirty(
              object.entity,
              'dirty_dependents',
              'dirty_quantity',
              'dirty_drawing'
            )
            {
              updated_object_ids: [object.id],
              events: [
                {
                  name: 'ExtensionConstructionIntentChanged',
                  object_ids: [object.id],
                  payload: {
                    schema_version: payload['schema_version'],
                    domains: payload['domains'].keys.sort,
                    replace: value(input, :replace) == true
                  }
                },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end
          store
        end

        def install_runtime_helper(runtime, store)
          singleton = class << runtime; self; end
          return if singleton.method_defined?(:extension_construction_intents)
          singleton.send(:define_method, :extension_construction_intents) { store }
        end

        def validation_errors(runtime, store, input)
          errors = []
          object = resolve_extension(runtime, input)
          errors << 'extension zone not found' unless object
          domains = value(input, :domains)
          errors << 'domains hash required' unless domains.is_a?(Hash)
          store.effective_domains(object.entity, domains || {}) if object && domains.is_a?(Hash)
          errors
        rescue StandardError => error
          [error.message]
        end

        def resolve_extension(runtime, input)
          entity = value(input, :entity)
          object_id = value(input, :object_id)
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(object_id.to_s)
          return nil unless object && object.type == 'extension.zone' && object.owner_module == 'constructflow.extension'
          object
        end

        def value(input, key)
          return nil unless input
          input[key] || input[key.to_s]
        end
      end
    end
  end
end
