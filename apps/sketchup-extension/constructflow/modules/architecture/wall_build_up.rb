# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      # Construction build-up catalog for Smart Walls.
      # A wall of thickness T becomes stacked material layers whose thickness
      # sums exactly to T, so joins, miters and hosted-opening cells keep
      # working with the existing single-thickness math.
      module WallBuildUp
        PLASTER_MM = 15.0
        DEFAULT_CORE_MM = 100.0

        LAYERS = {
          'aac' => [
            { material: 'CF Plaster', thickness_mm: PLASTER_MM, role: 'finish' },
            { material: 'CF AAC Block', thickness_mm: nil, role: 'core' }, # absorbs remainder
            { material: 'CF Plaster', thickness_mm: PLASTER_MM, role: 'finish' }
          ],
          'brick' => [
            { material: 'CF Plaster', thickness_mm: PLASTER_MM, role: 'finish' },
            { material: 'CF Brick', thickness_mm: nil, role: 'core' },
            { material: 'CF Plaster', thickness_mm: PLASTER_MM, role: 'finish' }
          ],
          'concrete' => [
            { material: 'CF Concrete', thickness_mm: nil, role: 'core' }
          ],
          'precast' => [
            { material: 'CF Concrete Precast', thickness_mm: nil, role: 'core' }
          ],
          'timber_frame' => [
            { material: 'CF Plaster', thickness_mm: PLASTER_MM, role: 'finish' },
            { material: 'CF Timber', thickness_mm: nil, role: 'core' },
            { material: 'CF Plaster', thickness_mm: PLASTER_MM, role: 'finish' }
          ],
          'drywall' => [
            { material: 'CF Plaster', thickness_mm: 12.5, role: 'finish' },
            { material: 'CF Insulation', thickness_mm: nil, role: 'core' },
            { material: 'CF Plaster', thickness_mm: 12.5, role: 'finish' }
          ]
        }.freeze

        DEFAULT_BUILD_UP = 'aac'.freeze

        module_function

        def build_up_for(wall_type_id)
          key = wall_type_id.to_s.downcase
          LAYERS.keys.each do |known|
            return known if key.include?(known)
          end
          return 'concrete' if key.include?('rc') || key.include?('column')

          DEFAULT_BUILD_UP
        end

        # Resolve layers for a wall thickness: the core layer absorbs the
        # remainder so layer thicknesses always sum exactly to thickness_mm.
        def layers_for(thickness_mm, wall_type_id = nil)
          total = Float(thickness_mm)
          key = build_up_for(wall_type_id)
          template = LAYERS.fetch(key)

          layers = template.map { |layer| { material: layer[:material], role: layer[:role], thickness_mm: layer[:thickness_mm] } }
          fixed_sum = layers.sum { |layer| layer[:thickness_mm].to_f }
          core = layers.find { |layer| layer[:role] == 'core' }

          if core.nil?
            # No core layer (every layer fixed): scale the last layer.
            last = layers.last
            last[:thickness_mm] = [total - (fixed_sum - last[:thickness_mm].to_f), 1.0].max
            return layers
          end
          if fixed_sum >= total
            # Too thin for plaster skins: collapse to a single core layer.
            return [{ material: core[:material], role: 'core', thickness_mm: total }]
          end

          core[:thickness_mm] = total - fixed_sum
          layers
        end

        def material_for(layer)
          layer[:material]
        end
      end
    end
  end
end
