# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      # Construction build-up catalog for architectural floors.
      # A floor of thickness T becomes stacked layers (structural slab +
      # finish) whose thickness sums exactly to T, so level/offset math and
      # hosted-object placement keep working unchanged.
      module FloorBuildUp
        DEFAULT_SLAB_MM = 120.0

        # finish surface_type -> [finish_material, finish_thickness_mm]
        FINISHES = {
          'tile' => ['CF Tile', 12.0],
          'terrazzo' => ['CF Tile', 15.0],
          'wood' => ['CF Timber', 18.0],
          'timber' => ['CF Timber', 18.0],
          'carpet' => ['CF Timber', 10.0]
        }.freeze

        module_function

        # Returns ordered layers from bottom (slab) to top (finish).
        def layers_for(thickness_mm, material_id = nil)
          total = Float(thickness_mm)
          key = build_up_for(material_id)
          finish_material, finish_thickness = FINISHES.fetch(key)

          finish = [finish_thickness, total / 4.0].min
          slab = total - finish
          if slab <= 0.0
            return [{ material: 'CF Concrete', role: 'slab', thickness_mm: total }]
          end

          [
            { material: 'CF Concrete', role: 'slab', thickness_mm: slab },
            { material: finish_material, role: 'finish', thickness_mm: finish }
          ]
        end

        def build_up_for(material_id)
          key = material_id.to_s.downcase
          FINISHES.keys.each do |known|
            return known if key.include?(known)
          end
          'tile'
        end
      end
    end
  end
end
