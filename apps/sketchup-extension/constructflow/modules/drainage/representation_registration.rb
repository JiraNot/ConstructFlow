# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      module RepresentationRegistration
        OWNER = 'constructflow.drainage'

        module_function

        def install(runtime)
          registry = runtime.representations
          provider = PlanRepresentationProvider.new

          register_plan(registry, 'drainage.pipe_route', provider)
          register_plan(registry, 'drainage.manhole', provider)
          register_plan(registry, 'drainage.downpipe', provider)
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
              'drawing_family' => 'plumbing_drainage_plan',
              'supports_scale_context' => true,
              'includes_annotations' => true
            }
          )
        end
      end
    end
  end
end
