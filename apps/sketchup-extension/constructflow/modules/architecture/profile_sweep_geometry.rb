# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class ProfileSweepGeometry
        def self.build(model, definition)
          new.create_group(model, definition)
        end

        def create_group(model, definition)
          group = model.active_entities.add_group
          group.name = "ConstructFlow Profile [#{definition.profile_code}]"
          tag = Core::TagManager.tag_for('architecture.profile_sweep') rescue 'CF_Architecture_Molding'
          Core::TagManager.apply_tag(group, tag, model: model) rescue nil
          group.set_attribute('ConstructFlow', 'type', 'architecture.profile_sweep')
          group.set_attribute('ConstructFlow', 'profile_code', definition.profile_code)
          group.set_attribute('ConstructFlow', 'anchor', definition.anchor.to_s)
          group.set_attribute('ConstructFlow', 'length_m', definition.total_length_m)
          rebuild!(group, definition)
          group
        end

        def rebuild!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          path = definition.path_mm
          return group if path.length < 2

          # Calculate bounding dimensions of 2D profile
          min_u = definition.profile_points_mm.map { |pt| pt[0] }.min
          max_u = definition.profile_points_mm.map { |pt| pt[0] }.max
          min_v = definition.profile_points_mm.map { |pt| pt[1] }.min
          max_v = definition.profile_points_mm.map { |pt| pt[1] }.max
          w = max_u - min_u
          h = max_v - min_v

          # Anchor offset
          offset = Core::StructuralProfileCatalog.anchor_offset(definition.anchor, w, h) rescue [0.0, 0.0]

          # Build segment by segment prisms with miter joins
          path.each_cons(2) do |p1, p2|
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            dz = p2[2] - p1[2]
            len = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
            next if len <= 0.001

            # Normal in XY plane
            plan_len = Math.sqrt((dx * dx) + (dy * dy))
            if plan_len > 0.001
              nx = -dy / plan_len
              ny = dx / plan_len
            else
              nx = 1.0
              ny = 0.0
            end

            # Shift origin by anchor
            sx1 = p1[0] - (nx * offset[0])
            sy1 = p1[1] - (ny * offset[0])
            sz1 = p1[2] - offset[1]

            sx2 = p2[0] - (nx * offset[0])
            sy2 = p2[1] - (ny * offset[0])
            sz2 = p2[2] - offset[1]

            # Extrude rectangular or polygon envelope
            p_start_b = point([sx1, sy1, sz1])
            p_start_t = point([sx1, sy1, sz1 + h])
            p_end_t   = point([sx2, sy2, sz2 + h])
            p_end_b   = point([sx2, sy2, sz2])

            face = entities.add_face(p_start_b, p_end_b, p_end_t, p_start_t) rescue nil
            if face
              thick_su = Core::Units.mm_to_su(w)
              face.pushpull(thick_su) rescue nil
            end
          end

          group
        end

        private

        def point(pt_mm)
          Geom::Point3d.new(
            Core::Units.mm_to_su(pt_mm[0]),
            Core::Units.mm_to_su(pt_mm[1]),
            Core::Units.mm_to_su(pt_mm[2])
          )
        end
      end
    end
  end
end
