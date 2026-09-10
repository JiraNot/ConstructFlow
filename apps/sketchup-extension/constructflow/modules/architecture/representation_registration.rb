# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module RepresentationRegistration
        OWNER = 'constructflow.architecture'

        module_function

        def install(runtime)
          registry = runtime.representations
          provider = PlanRepresentationProvider.new
          return provider if registry.registered?('architecture.wall', 'plan')

          registry.register(
            object_type: 'architecture.wall',
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
