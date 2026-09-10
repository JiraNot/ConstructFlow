# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      module RepresentationRegistration
        OWNER = 'constructflow.surface'
        TYPES = %w[surface.boundary surface.pattern].freeze

        module_function

        def install(runtime)
          registry = runtime.representations
          provider = PlanRepresentationProvider.new(runtime: runtime)
          TYPES.each { |type| register_plan(registry, type, provider) }
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
              'drawing_family' => 'surface_paving_plan',
              'supports_scale_context' => true,
              'includes_annotations' => true
            }
          )
        end
      end
    end
  end
end
