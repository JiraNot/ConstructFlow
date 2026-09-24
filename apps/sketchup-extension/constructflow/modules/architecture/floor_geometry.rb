# frozen_string_literal: true

require_relative 'floor_build_up'
require_relative '../../core/model_materials'

module JiraNot
  module ConstructFlow
    module Architecture
      class FloorGeometry
        def create_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Architectural Floor'
          rebuild!(group, definition)
          group
        end

        def rebuild!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          model = group_model(group)
          layers = FloorBuildUp.layers_for(definition.thickness_mm, definition.material_id)
          layers_group = entities.add_group
          layers_group.name = 'Construction Layers'
          layer_entities = layers_group.entities

          offset = 0.0
          layers.each do |layer|
            face = layer_entities.add_face(elevated_boundary(definition, offset))
            raise "failed to create floor layer face: #{layer[:material]}" unless face

            definition.holes_mm.each do |loop|
              hole = layer_entities.add_face(elevated_loop(loop, offset))
              hole.erase! if hole && hole.respond_to?(:valid?) && hole.valid?
            end
            face.pushpull(Core::Units.mm_to_su(layer[:thickness_mm]))
            Core::ModelMaterials.paint(model, face, layer[:material])
            offset += Float(layer[:thickness_mm])
          end
          group
        end

        private

        # Each layer starts where the previous one ended, so the stack keeps
        # the floor's total thickness (and level math) unchanged.
        def elevated_boundary(definition, offset_mm)
          definition.boundary_mm.map { |value| point_from_mm(elevated_point(value, offset_mm)) }
        end

        def elevated_loop(loop, offset_mm)
          loop.map { |value| point_from_mm(elevated_point(value, offset_mm)) }
        end

        def elevated_point(values, offset_mm)
          [values[0], values[1], Float(values[2]) + offset_mm]
        end

        def group_model(group)
          return nil unless group.respond_to?(:model)

          model = group.model
          model.respond_to?(:materials) ? model : nil
        rescue StandardError
          nil
        end

        def point_from_mm(values)
          x, y, z = Core::Units.point_from_mm(values)
          Geom::Point3d.new(x, y, z)
        end
      end
    end
  end
end
