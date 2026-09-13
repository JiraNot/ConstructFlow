# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class CurtainWallGeometry
        attr_reader :definition

        def initialize(definition)
          @definition = definition
        end

        def generate(entities)
          group = entities.add_group
          group.name = "Curtain Wall & Lattice [#{@definition.infill_type.upcase}]"
          build_geometry(group.entities)
          
          CurtainWallRepository.new.save(group, @definition)
          group
        end

        def rebuild(group, new_definition)
          @definition = new_definition
          group.entities.clear!
          group.name = "Curtain Wall & Lattice [#{@definition.infill_type.upcase}]"
          build_geometry(group.entities)
          
          CurtainWallRepository.new.save(group, @definition)
          group
        end

        private

        def build_geometry(target_entities)
          pts = @definition.boundary_mm
          return if pts.length < 3

          # Compute local axes on the face plane
          p0 = Geom::Point3d.new(pts[0][0].mm, pts[0][1].mm, pts[0][2].mm)
          p1 = Geom::Point3d.new(pts[1][0].mm, pts[1][1].mm, pts[1][2].mm)
          p2 = Geom::Point3d.new(pts[2][0].mm, pts[2][1].mm, pts[2][2].mm)

          v_u = p1 - p0
          v_u.normalize!
          normal = (p1 - p0) * (p2 - p0)
          normal.normalize!
          v_v = normal * v_u
          v_v.normalize!

          # Project all boundary points to (u, v) 2D plane
          u_coords = []
          v_coords = []
          pts.each do |pt_arr|
            pt = Geom::Point3d.new(pt_arr[0].mm, pt_arr[1].mm, pt_arr[2].mm)
            vec = pt - p0
            u_coords << (vec % v_u)
            v_coords << (vec % v_v)
          end

          min_u, max_u = u_coords.min, u_coords.max
          min_v, max_v = v_coords.min, v_coords.max

          total_w = max_u - min_u
          total_h = max_v - min_v

          m_w = @definition.mullion_width_mm.mm
          m_d = @definition.mullion_depth_mm.mm
          t_w = @definition.transom_width_mm.mm
          t_d = @definition.transom_depth_mm.mm

          # Subgroups for organization
          frame_grp = target_entities.add_group
          frame_grp.name = 'Mullions & Transoms (โครงกรอบอลูมิเนียม)'
          infill_grp = target_entities.add_group
          infill_grp.name = "Infill Panels (#{@definition.infill_type})"

          # Number of divisions
          cols = (total_w / @definition.grid_width_mm.mm).ceil
          cols = [cols, 1].max
          col_step = total_w / cols

          rows = (total_h / @definition.grid_height_mm.mm).ceil
          rows = [rows, 1].max
          row_step = total_h / rows

          # 1. Generate Mullions (Vertical members)
          (0..cols).each do |c|
            u_val = min_u + c * col_step
            p_bot = p0 + (v_u * u_val) + (v_v * min_v)
            p_top = p0 + (v_u * u_val) + (v_v * max_v)
            add_extruded_member(frame_grp.entities, p_bot, p_top, normal, m_w, m_d)
          end

          # 2. Generate Transoms (Horizontal members)
          (0..rows).each do |r|
            v_val = min_v + r * row_step
            (0...cols).each do |c|
              u_start = min_u + c * col_step
              u_end   = min_u + (c + 1) * col_step
              p_left  = p0 + (v_u * u_start) + (v_v * v_val)
              p_right = p0 + (v_u * u_end)   + (v_v * v_val)
              add_extruded_member(frame_grp.entities, p_left, p_right, normal, t_w, t_d)
            end
          end

          # 3. Generate Infill (Glass panels or Angled Louver Slats)
          case @definition.infill_type
          when :glass, :solid
            glass_t = @definition.infill_thickness_mm.mm
            (0...cols).each do |c|
              u1 = min_u + c * col_step + (m_w / 2.0)
              u2 = min_u + (c + 1) * col_step - (m_w / 2.0)
              next if u2 <= u1

              (0...rows).each do |r|
                v1 = min_v + r * row_step + (t_w / 2.0)
                v2 = min_v + (r + 1) * row_step - (t_w / 2.0)
                next if v2 <= v1

                add_panel(infill_grp.entities, p0, v_u, v_v, normal, u1, u2, v1, v2, glass_t)
              end
            end
          when :louver, :slat
            slat_t = @definition.infill_thickness_mm.mm
            angle_rad = @definition.louver_angle_deg * Math::PI / 180.0
            (0...cols).each do |c|
              u1 = min_u + c * col_step + (m_w / 2.0)
              u2 = min_u + (c + 1) * col_step - (m_w / 2.0)
              next if u2 <= u1

              (0...rows).each do |r|
                v_center = min_v + (r + 0.5) * row_step
                add_slat(infill_grp.entities, p0, v_u, v_v, normal, u1, u2, v_center, row_step * 0.9, slat_t, angle_rad)
              end
            end
          end
        end

        def add_extruded_member(entities, pt1, pt2, normal, width, depth)
          vec = pt2 - pt1
          len = vec.length
          return if len < 1.mm

          member = entities.add_group
          w_vec = (vec * normal)
          w_vec.normalize!
          w_vec = w_vec * (width / 2.0)
          d_vec = normal * (depth / 2.0)

          p_a = pt1 - w_vec - d_vec
          p_b = pt1 + w_vec - d_vec
          p_c = pt1 + w_vec + d_vec
          p_d = pt1 - w_vec + d_vec

          face = member.entities.add_face(p_a, p_b, p_c, p_d)
          if face
            # Push along member vector
            face.pushpull(-len)
          end
        end

        def add_panel(entities, p0, v_u, v_v, normal, u1, u2, v1, v2, thickness)
          panel_grp = entities.add_group
          d_vec = normal * (thickness / 2.0)

          p_a = p0 + (v_u * u1) + (v_v * v1) - d_vec
          p_b = p0 + (v_u * u2) + (v_v * v1) - d_vec
          p_c = p0 + (v_u * u2) + (v_v * v2) - d_vec
          p_d = p0 + (v_u * u1) + (v_v * v2) - d_vec

          face = panel_grp.entities.add_face(p_a, p_b, p_c, p_d)
          face.pushpull(thickness) if face
        end

        def add_slat(entities, p0, v_u, v_v, normal, u1, u2, v_center, slat_height, thickness, angle_rad)
          slat_grp = entities.add_group
          c_left  = p0 + (v_u * u1) + (v_v * v_center)
          c_right = p0 + (v_u * u2) + (v_v * v_center)

          # Tilt around U vector
          t_v = v_v * (Math.cos(angle_rad) * slat_height / 2.0)
          t_n = normal * (Math.sin(angle_rad) * slat_height / 2.0)

          p_a = c_left  - t_v - t_n
          p_b = c_right - t_v - t_n
          p_c = c_right + t_v + t_n
          p_d = c_left  + t_v + t_n

          face = slat_grp.entities.add_face(p_a, p_b, p_c, p_d)
          face.pushpull(thickness) if face
        end
      end
    end
  end
end
