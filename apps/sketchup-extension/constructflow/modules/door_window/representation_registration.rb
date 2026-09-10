# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      module RepresentationRegistration
        OWNER = 'constructflow.door_window'

        module_function

        def install(runtime)
          registry = runtime.representations
          provider = PlanRepresentationProvider.new(runtime: runtime)
          return provider if registry.registered?('door_window.instance', 'plan')

          registry.register(
            object_type: 'door_window.instance',
            kind: 'plan',
            owner_module: OWNER,
            provider: provider,
            policy: 'on_demand',
            metadata: {
              'drawing_family' => 'architecture_plan',
              'supports_scale_context' => true,
              'includes_annotations' => true
            }
          )
          provider
        end
      end
    end
  end
end
