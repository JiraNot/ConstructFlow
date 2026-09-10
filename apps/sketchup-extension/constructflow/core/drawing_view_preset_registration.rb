# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module DrawingViewPresetRegistration
        module_function

        def install(registry)
          register(registry, 'plumbing.simple', 'Plumbing Plan - Simple', '1:100', 'coordination', 'simple')
          register(registry, 'plumbing.construction', 'Plumbing Plan - Construction', '1:50', 'proposed', 'construction')
          register(registry, 'plumbing.coordination', 'Plumbing Plan - Coordination', '1:50', 'coordination', 'coordination')
          registry
        end

        def register(registry, id, name, scale, phase_view, lod)
          registry.register(
            id: id,
            name: name,
            drawing_family: 'plumbing_drainage_plan',
            scale: scale,
            phase_view: phase_view,
            lod: lod,
            tag_name: "CF-DRAWING-#{id.split('.').last.upcase}",
            scene_name: "ConstructFlow - #{name}",
            context: { 'style_preset' => id }
          )
        end
      end
    end
  end
end
