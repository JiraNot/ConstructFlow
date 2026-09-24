# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Shared helper for creating/reusing named SketchUp materials with fixed
      # colors so every domain renders consistently. Safe outside SketchUp:
      # returns nil when there is no real model/materials API, so geometry
      # code can call it unconditionally.
      module ModelMaterials
        COLORS = {
          'CF Plaster' => [225, 220, 210],
          'CF AAC Block' => [196, 199, 192],
          'CF Brick' => [168, 96, 72],
          'CF Concrete' => [170, 170, 165],
          'CF Concrete Precast' => [185, 187, 180],
          'CF Timber' => [204, 164, 111],
          'CF Glass' => [188, 212, 218],
          'CF Metal' => [150, 152, 155],
          'CF Steel' => [120, 124, 130],
          'CF Tile' => [212, 214, 208],
          'CF Roof Metal Sheet' => [142, 148, 155],
          'CF Roof Tile' => [172, 92, 68],
          'CF Insulation' => [236, 224, 130],
          'CF Membrane' => [72, 74, 78]
        }.freeze

        module_function

        # Fetch-or-create the named material on the model. Returns nil when
        # SketchUp is stubbed (tests) or anything goes wrong: callers may
        # assign the result unconditionally.
        def apply(model, material_name)
          return nil unless material_name
          return nil if model.nil? || !model.respond_to?(:materials)

          materials = model.materials
          return nil unless materials.respond_to?(:[])

          material = materials[material_name]
          return material if material

          rgb = COLORS[material_name]
          return nil unless rgb && materials.respond_to?(:add)

          material = materials.add(material_name)
          material.color = Sketchup::Color.new(rgb[0], rgb[1], rgb[2]) if material.respond_to?(:color=)
          material
        rescue StandardError
          nil
        end

        # Apply to a single entity (face/group/component) when possible.
        def paint(model, entity, material_name)
          material = apply(model, material_name)
          return false unless material && entity.respond_to?(:material=)

          entity.material = material
          true
        rescue StandardError
          false
        end
      end
    end
  end
end
