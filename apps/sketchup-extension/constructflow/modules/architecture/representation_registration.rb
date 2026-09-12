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
          documentation_provider = DocumentationRepresentationProvider.new
          return provider if registry.registered?('architecture.wall', 'plan') && registry.registered?('architecture.floor', 'plan') && registry.registered?('architecture.room', 'plan') && registry.registered?('architecture.ceiling', 'plan') && registry.registered?('architecture.wall', 'elevation') && registry.registered?('architecture.wall', 'section')

          registry.register(
            object_type: 'architecture.wall', kind: 'plan', owner_module: OWNER, provider: provider,
            policy: 'on_demand', metadata: {
              'drawing_family' => 'architecture_plan', 'supports_scale_context' => true, 'includes_annotations' => true
            }
          ) unless registry.registered?('architecture.wall', 'plan')
          registry.register(
            object_type: 'architecture.floor',
            kind: 'plan',
            owner_module: OWNER,
            provider: provider,
            policy: 'on_demand',
            metadata: {
              'drawing_family' => 'architecture_plan',
              'supports_scale_context' => true,
              'includes_annotations' => true
            }
          ) unless registry.registered?('architecture.floor', 'plan')
          registry.register(
            object_type: 'architecture.room', kind: 'plan', owner_module: OWNER, provider: provider,
            policy: 'on_demand', metadata: { 'drawing_family' => 'architecture_plan', 'includes_annotations' => true }
          ) unless registry.registered?('architecture.room', 'plan')
          registry.register(
            object_type: 'architecture.ceiling', kind: 'plan', owner_module: OWNER, provider: provider,
            policy: 'on_demand', metadata: { 'drawing_family' => 'architecture_plan', 'includes_annotations' => true }
          ) unless registry.registered?('architecture.ceiling', 'plan')
          %w[elevation section].each do |kind|
            registry.register(
              object_type: 'architecture.wall', kind: kind, owner_module: OWNER,
              provider: documentation_provider, policy: 'on_demand',
              metadata: { 'drawing_family' => 'architecture_documentation', 'supports_scale_context' => true, 'includes_annotations' => true }
            ) unless registry.registered?('architecture.wall', kind)
          end
          provider
        end
      end
    end
  end
end
