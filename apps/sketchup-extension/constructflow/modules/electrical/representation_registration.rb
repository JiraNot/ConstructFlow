# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      module RepresentationRegistration
        OWNER = 'constructflow.electrical'
        TYPES = %w[
          electrical.luminaire electrical.switch electrical.outlet
          electrical.dedicated_outlet electrical.data electrical.tv
        ].freeze

        module_function

        def install(runtime)
          registry = runtime.representations
          provider = PlanRepresentationProvider.new(runtime: runtime)
          TYPES.each do |type|
            next if registry.registered?(type, 'plan')
            registry.register(
              object_type: type, kind: 'plan', owner_module: OWNER,
              provider: provider, policy: 'on_demand',
              metadata: {
                'drawing_family' => 'electrical_plan',
                'supports_scale_context' => true,
                'includes_annotations' => true
              }
            )
          end
          provider
        end
      end
    end
  end
end
