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

          profile_pts = definition.profile_points_mm
          return group if profile_pts.length < 3

          # Build segment by segment 3D solid profiles
          path.each_cons(2) do |p1_arr, p2_arr|
            p1_su_x = Core::Units.mm_to_su(p1_arr[0])
            p1_su_y = Core::Units.mm_to_su(p1_arr[1])
            p1_su_z = Core::Units.mm_to_su(p1_arr[2] || 0.0)

            p2_su_x = Core::Units.mm_to_su(p2_arr[0])
            p2_su_y = Core::Units.mm_to_su(p2_arr[1])
            p2_su_z = Core::Units.mm_to_su(p2_arr[2] || 0.0)

            dx_su = p2_su_x - p1_su_x
            dy_su = p2_su_y - p1_su_y
            dz_su = p2_su_z - p1_su_z
            len = Math.sqrt(dx_su * dx_su + dy_su * dy_su + dz_su * dz_su)
            next if len < Core::Units.mm_to_su(1.0)

            plan_len = Math.sqrt(dx_su * dx_su + dy_su * dy_su)
            if plan_len > 0.001
              nx = -dy_su / plan_len
              ny = dx_su / plan_len
            else
              nx = 1.0
              ny = 0.0
            end

            # Build 2D cross section face at p1
            sub_grp = entities.add_group
            face_pts = profile_pts.map do |u_mm, v_mm|
              u_su = Core::Units.mm_to_su(u_mm)
              v_su = Core::Units.mm_to_su(v_mm)
              Geom::Point3d.new(
                p1_su_x + nx * u_su,
                p1_su_y + ny * u_su,
                p1_su_z + v_su
              )
            end

            face = sub_grp.entities.add_face(face_pts) rescue nil
            if face
              vec = Geom::Vector3d.new(dx_su, dy_su, dz_su) rescue nil
              if face.respond_to?(:normal) && face.normal && vec && face.normal.respond_to?(:%) && (face.normal % vec) < 0
                face.reverse! rescue nil
              end
              face.pushpull(len) if face.respond_to?(:pushpull)
            else
              # Fallback to simple bounding box
              min_u = profile_pts.map(&:first).min
              max_u = profile_pts.map(&:first).max
              min_v = profile_pts.map(&:last).min
              max_v = profile_pts.map(&:last).max
              w = max_u - min_u
              h = max_v - min_v
              
              fb_pts = [
                p1,
                p1 + (v_normal * Core::Units.mm_to_su(w)),
                p1 + (v_normal * Core::Units.mm_to_su(w)) + (v_up * Core::Units.mm_to_su(h)),
                p1 + (v_up * Core::Units.mm_to_su(h))
              ]
              fb_face = sub_grp.entities.add_face(fb_pts) rescue nil
              if fb_face
                fb_face.reverse! if (fb_face.normal % vec) < 0
                fb_face.pushpull(len) rescue nil
              end
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
