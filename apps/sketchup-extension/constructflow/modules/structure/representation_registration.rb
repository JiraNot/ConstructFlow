# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      module RepresentationRegistration
        OWNER = 'constructflow.structure'

        module_function

        def install(runtime)
          registry = runtime.representations
          provider = PlanRepresentationProvider.new
          register_plan(registry, 'structure.column', provider)
          register_plan(registry, 'structure.foundation', provider)
          provider
        end

        def register_plan(registry, object_type, provider)
          return if registry.registered?(object_type, 'plan')

          registry.register(
            object_type: object_type,
            kind: 'plan',
            owner_module: OWNER,
            provider: provider,
            policy: 'on_demand',
            metadata: {
              'drawing_family' => 'structure_plan',
              'supports_scale_context' => true,
              'includes_annotations' => true
            }
          )
        end
      end
    end
  end
end
