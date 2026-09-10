# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      module RepresentationRegistration
        OWNER = 'constructflow.roof'

        module_function

        def install(runtime)
          registry = runtime.representations
          provider = PlanRepresentationProvider.new
          return provider if registry.registered?('roof.system', 'plan')

          registry.register(
            object_type: 'roof.system',
            kind: 'plan',
            owner_module: OWNER,
            provider: provider,
            policy: 'on_demand',
            metadata: {
              'drawing_family' => 'roof_plan',
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
