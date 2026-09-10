# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module DrawingViewPresetRegistration
        module_function

        PROFILES = [
          ['simple', 'Simple', '1:100', 'coordination', 'simple'],
          ['construction', 'Construction', '1:50', 'proposed', 'construction'],
          ['coordination', 'Coordination', '1:50', 'coordination', 'coordination']
        ].freeze

        FAMILIES = [
          ['plumbing', 'Plumbing Plan', 'plumbing_drainage_plan', true],
          ['architecture', 'Architecture Plan', 'architecture_plan', false],
          ['structure', 'Structure Plan', 'structure_plan', false],
          ['roof', 'Roof Plan', 'roof_plan', false],
          ['surface', 'Surface / Paving Plan', 'surface_paving_plan', false],
          ['interior', 'Interior / Joinery Plan', 'interior_joinery_plan', false],
          ['electrical', 'Electrical Plan', 'electrical_plan', false]
        ].freeze

        def install(registry)
          FAMILIES.each do |prefix, label, drawing_family, legacy_short_tag|
            register_family(
              registry,
              prefix: prefix,
              label: label,
              drawing_family: drawing_family,
              legacy_short_tag: legacy_short_tag
            )
          end
          registry
        end

        def register_family(registry, prefix:, label:, drawing_family:, legacy_short_tag: false)
          PROFILES.each do |suffix, profile_label, scale, phase_view, lod|
            id = "#{prefix}.#{suffix}"
            name = "#{label} - #{profile_label}"
            register(
              registry,
              id,
              name,
              drawing_family,
              scale,
              phase_view,
              lod,
              tag_name: tag_name(id, suffix, legacy_short_tag: legacy_short_tag)
            )
          end
        end

        def register(registry, id, name, drawing_family, scale, phase_view, lod, tag_name:)
          return registry.fetch(id) if registry.fetch(id)

          registry.register(
            id: id,
            name: name,
            drawing_family: drawing_family,
            scale: scale,
            phase_view: phase_view,
            lod: lod,
            tag_name: tag_name,
            scene_name: "ConstructFlow - #{name}",
            context: { 'style_preset' => id }
          )
        end

        def tag_name(id, suffix, legacy_short_tag:)
          return "CF-DRAWING-#{suffix.upcase}" if legacy_short_tag
          "CF-DRAWING-#{id.tr('.', '-').upcase}"
        end
      end
    end
  end
end
