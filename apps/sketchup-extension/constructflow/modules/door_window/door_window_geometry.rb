# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      class DoorWindowGeometry
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
          frame = opening_host_capability.frame_points(opening_object)
          add_rectangle(entities, frame)
          parameters = type.parametric_parameters(instance_parameters: instance_parameters)
          inner = inset_frame(frame, parameters.fetch('frame'))
          add_rectangle(entities, inner) if inner
          add_panels(entities, inner || frame, type)
          group
        end

        private

        def add_panels(entities, frame, type)
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
            add_role_symbol(entities, frame, index, count, role)
          end
        end

        def add_role_symbol(entities, frame, index, count, role)
          bottom_left, bottom_right, top_right, top_left = frame
          left_ratio = index.to_f / count
          right_ratio = (index + 1).to_f / count
          bl = interpolate(bottom_left, bottom_right, left_ratio)
          br = interpolate(bottom_left, bottom_right, right_ratio)
          tl = interpolate(top_left, top_right, left_ratio)
          tr = interpolate(top_left, top_right, right_ratio)

          case role.to_s
          when /swing_left/
            add_line(entities, br, tl)
          when /swing_right/
            add_line(entities, bl, tr)
          when /slide_left/, /slide_right/
            mid_left = interpolate(bl, tl, 0.5)
            mid_right = interpolate(br, tr, 0.5)
            add_line(entities, mid_left, mid_right)
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
