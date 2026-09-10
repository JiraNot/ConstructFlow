# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      module RepresentationRegistration
        OWNER = 'constructflow.interior'

        module_function

        def install(runtime)
          registry = runtime.representations
          provider = PlanRepresentationProvider.new
          return provider if registry.registered?('interior.cabinet_run', 'plan')

          registry.register(
            object_type: 'interior.cabinet_run',
            kind: 'plan',
            owner_module: OWNER,
            provider: provider,
            policy: 'on_demand',
            metadata: {
              'drawing_family' => 'interior_joinery_plan',
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
