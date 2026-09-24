# frozen_string_literal: true

require_relative '../../core/model_materials'

module JiraNot
  module ConstructFlow
    module DoorWindow
      class DoorWindowGeometry
        LEAF_DEPTH_MM = 40.0
        GLASS_THICKNESS_MM = 6.0
        FRAME_DEPTH_MM = 100.0

        def create_group(model, opening_object:, type:, opening_host_capability:, instance_parameters: {})
          group = model.active_entities.add_group
          group.name = "ConstructFlow #{type.category.capitalize}"
          rebuild!(
            group,
            opening_object: opening_object,
            type: type,
            opening_host_capability: opening_host_capability,
            instance_parameters: instance_parameters
          )
          group
        end

        def rebuild!(group, opening_object:, type:, opening_host_capability:, instance_parameters: {})
          raise ArgumentError, type.errors.join('; ') unless type.valid?

          entities = group.entities
          entities.clear!
          model = group_model(group)
          frame = opening_host_capability.frame_points(opening_object)
          depth_mm = infill_depth_mm(opening_host_capability, opening_object)
          parameters = type.parametric_parameters(instance_parameters: instance_parameters)

          add_3d_frame(entities, model, frame, parameters.fetch('frame'), depth_mm)
          inner = inset_frame(frame, parameters.fetch('frame'))
          add_3d_glass(entities, model, inner, depth_mm) if inner
          add_panels(entities, model, inner || frame, type, depth_mm)
          group
        end

        private

        def group_model(group)
          return nil unless group.respond_to?(:model)

          model = group.model
          model.respond_to?(:materials) ? model : nil
        rescue StandardError
          nil
        end

        # Depth of the infill: match the host opening's wall thickness when the
        # capability can report it, so frames fill the reveal. Fallback is a
        # nominal 100 mm wall.
        def infill_depth_mm(capability, opening_object)
          return FRAME_DEPTH_MM unless capability.respond_to?(:infill_depth_mm)

          value = Float(capability.infill_depth_mm(opening_object))
          value.positive? ? value : FRAME_DEPTH_MM
        rescue StandardError
          FRAME_DEPTH_MM
        end

        # Frame as four real members (jambs, head, sill) filling the reveal.
        def add_3d_frame(entities, model, frame, inset_mm, depth_mm)
          inner = inset_frame(frame, inset_mm)
          unless inner && depth_mm.positive?
            add_rectangle(entities, frame)
            return
          end

          normal = frame_normal(frame)
          frame_members(frame, inner).each do |quad|
            face = add_face_from_corners(entities, quad.map { |values| point(values) })
            next unless face

            face.pushpull(vector_mm(normal, depth_mm))
            Core::ModelMaterials.paint(model, face, 'CF Timber')
          end
        end

        def frame_members(frame, inner)
          bl, br, tr, tl = frame
          ibl, ibr, itr, itl = inner
          [
            [bl, ibl, itl, tl], # left jamb
            [ibr, br, tr, itr], # right jamb
            [itl, itr, tr, tl], # head
            [bl, br, ibr, ibl]  # sill
          ]
        end

        def frame_normal(frame)
          first, second = frame
          dx = second[0] - first[0]
          dy = second[1] - first[1]
          length = Math.sqrt((dx * dx) + (dy * dy))
          return [0.0, 1.0, 0.0] if length <= 0.001

          [(-dy / length), (dx / length), 0.0]
        end

        def vector_mm(normal_xyz, depth_mm)
          su = Core::Units.mm_to_su(depth_mm)
          Geom::Vector3d.new(normal_xyz[0] * su, normal_xyz[1] * su, normal_xyz[2] * su)
        rescue NameError
          nil
        end

        # Glass sheet spanning the clear opening inside the frame.
        def add_3d_glass(entities, model, inner_frame, depth_mm)
          depth = [GLASS_THICKNESS_MM, depth_mm / 4.0].min
          face = add_face_from_corners(entities, inner_frame.map { |values| point(values) })
          return unless face

          vector = vector_mm(frame_normal(inner_frame), depth)
          face.pushpull(vector) if vector
          Core::ModelMaterials.paint(model, face, 'CF Glass')
        end

        def add_panels(entities, model, frame, type, depth_mm)
          count = [type.panel_roles.length, 1].max
          bottom_left, bottom_right, top_right, top_left = frame
          count.times do |index|
            next if index.zero?

            ratio = index.to_f / count
            bottom = interpolate(bottom_left, bottom_right, ratio)
            top = interpolate(top_left, top_right, ratio)
            add_line(entities, bottom, top)
          end

          type.panel_roles.each_with_index do |role, index|
            add_role_symbol(entities, model, frame, index, count, role, depth_mm)
          end
        end

        def add_role_symbol(entities, model, frame, index, count, role, depth_mm)
          bottom_left, bottom_right, top_right, top_left = frame
          left_ratio = index.to_f / count
          right_ratio = (index + 1).to_f / count
          bl = interpolate(bottom_left, bottom_right, left_ratio)
          br = interpolate(bottom_left, bottom_right, right_ratio)
          tl = interpolate(top_left, top_right, left_ratio)
          tr = interpolate(top_left, top_right, right_ratio)

          case role.to_s
          when /swing_left/
            add_leaf_slab(entities, model, [bl, br, tr, tl], depth_mm)
            add_line(entities, br, tl)
          when /swing_right/
            add_leaf_slab(entities, model, [bl, br, tr, tl], depth_mm)
            add_line(entities, bl, tr)
          when /slide_left/
            add_leaf_slab(entities, model, [bl, br, tr, tl], depth_mm, :front)
            add_line(entities, interpolate(bl, tl, 0.5), interpolate(br, tr, 0.5))
          when /slide_right/
            add_leaf_slab(entities, model, [bl, br, tr, tl], depth_mm, :back)
            add_line(entities, interpolate(bl, tl, 0.5), interpolate(br, tr, 0.5))
          end
        end

        # A hinged/sliding leaf as a real slab with thickness. Sliding leaves
        # offset to alternating planes along the wall normal so adjacent
        # panels read as interlocking tracks.
        def add_leaf_slab(entities, model, corners, depth_mm, side = :center)
          depth = [LEAF_DEPTH_MM, depth_mm / 2.0].min
          shifted = shifted_corners(corners, depth_mm, side)
          face = add_face_from_corners(entities, shifted.map { |values| point(values) })
          return unless face

          vector = vector_mm(frame_normal(shifted), depth)
          face.pushpull(vector) if vector
          Core::ModelMaterials.paint(model, face, 'CF Timber')
        end

        def shifted_corners(corners, depth_mm, side)
          shift = case side
                  when :front then depth_mm / 6.0
                  when :back then -depth_mm / 6.0
                  else 0.0
                  end
          return corners if shift.zero?

          normal = frame_normal(corners)
          corners.map do |values|
            [values[0] + (normal[0] * shift), values[1] + (normal[1] * shift), values[2]]
          end
        end

        def inset_frame(frame, inset_mm)
          inset = Float(inset_mm)
          return nil unless inset.positive?

          p0, p1, p2, p3 = frame
          dx = p1[0] - p0[0]
          dy = p1[1] - p0[1]
          width = Math.sqrt((dx * dx) + (dy * dy))
          height = p3[2] - p0[2]
          return nil if width <= (2.0 * inset) || height <= (2.0 * inset)

          ux = dx / width
          uy = dy / width
          [
            [p0[0] + (ux * inset), p0[1] + (uy * inset), p0[2] + inset],
            [p1[0] - (ux * inset), p1[1] - (uy * inset), p1[2] + inset],
            [p2[0] - (ux * inset), p2[1] - (uy * inset), p2[2] - inset],
            [p3[0] + (ux * inset), p3[1] + (uy * inset), p3[2] - inset]
          ].map(&:freeze).freeze
        end

        def add_face_from_corners(entities, corners)
          entities.add_face(*corners)
        rescue StandardError
          nil
        end

        def add_rectangle(entities, points)
          points.each_with_index do |point, index|
            add_line(entities, point, points[(index + 1) % points.length])
          end
        end

        def add_line(entities, a_mm, b_mm)
          entities.add_line(point(a_mm), point(b_mm))
        end

        def point(values_mm)
          x, y, z = Core::Units.point_from_mm(values_mm)
          Geom::Point3d.new(x, y, z)
        end

        def interpolate(a, b, ratio)
          [
            a[0] + ((b[0] - a[0]) * ratio),
            a[1] + ((b[1] - a[1]) * ratio),
            a[2] + ((b[2] - a[2]) * ratio)
          ].freeze
        end
      end
    end
  end
end
