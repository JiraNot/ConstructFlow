# frozen_string_literal: true

require_relative 'units'

module JiraNot
  module ConstructFlow
    module Core
      module GhostPreview
        GL_LINES_MODE   = defined?(GL_LINES) ? GL_LINES : 1
        GL_POLYGON_MODE = defined?(GL_POLYGON) ? GL_POLYGON : 9

        module_function

        def to_coords(pt)
          if pt.respond_to?(:x) && pt.respond_to?(:y) && pt.respond_to?(:z)
            [pt.x.to_f, pt.y.to_f, pt.z.to_f]
          elsif pt.is_a?(Array)
            [pt[0].to_f, pt[1].to_f, pt[2].to_f]
          else
            [0.0, 0.0, 0.0]
          end
        end

        # --- 1. GHOST WALL ---
        def build_wall_mesh(start_pt, end_pt, thickness_mm, height_mm)
          s = to_coords(start_pt)
          e = to_coords(end_pt)
          dx = e[0] - s[0]
          dy = e[1] - s[1]
          len_su = Math.hypot(dx, dy)
          return nil if len_su < 0.001

          ux = dx / len_su
          uy = dy / len_su
          nx = -uy
          ny = ux

          half_t_su = Units.mm_to_su(thickness_mm) / 2.0
          h_su = Units.mm_to_su(height_mm)

          b1 = [s[0] - nx * half_t_su, s[1] - ny * half_t_su, s[2]]
          b2 = [s[0] + nx * half_t_su, s[1] + ny * half_t_su, s[2]]
          b3 = [e[0] + nx * half_t_su, e[1] + ny * half_t_su, e[2]]
          b4 = [e[0] - nx * half_t_su, e[1] - ny * half_t_su, e[2]]

          t1 = [b1[0], b1[1], s[2] + h_su]
          t2 = [b2[0], b2[1], s[2] + h_su]
          t3 = [b3[0], b3[1], e[2] + h_su]
          t4 = [b4[0], b4[1], e[2] + h_su]

          {
            type: :wall,
            length_mm: Units.su_to_mm(len_su).round(1),
            thickness_mm: thickness_mm,
            height_mm: height_mm,
            wireframe_lines: [
              b1, b2, b2, b3, b3, b4, b4, b1,
              t1, t2, t2, t3, t3, t4, t4, t1,
              b1, t1, b2, t2, b3, t3, b4, t4
            ],
            centerlines: [
              s, e,
              [s[0], s[1], s[2] + h_su], [e[0], e[1], e[2] + h_su],
              s, [s[0], s[1], s[2] + h_su],
              e, [e[0], e[1], e[2] + h_su]
            ],
            faces: [
              [t1, t2, t3, t4], [b1, b4, b3, b2],
              [b1, b2, t2, t1], [b2, b3, t3, t2],
              [b3, b4, t4, t3], [b4, b1, t1, t4]
            ],
            midpoint: [(s[0] + e[0]) / 2.0, (s[1] + e[1]) / 2.0, (s[2] + e[2]) / 2.0 + h_su + 2.0],
            label: "ผนัง: ยาว #{Units.su_to_mm(len_su).round} mm | หนา #{thickness_mm.to_i} mm | สูง #{height_mm.to_i} mm"
          }
        end

        # --- 2. GHOST OPENING CUTOUT ---
        def build_opening_mesh(wall_definition, segment_index, distance_along_mm, width_mm, height_mm, sill_mm)
          path_mm = wall_definition.path_mm
          segment = path_mm.each_cons(2).to_a[segment_index]
          return nil unless segment

          s_mm, f_mm = segment
          dx_mm = f_mm[0] - s_mm[0]
          dy_mm = f_mm[1] - s_mm[1]
          seg_len_mm = Math.hypot(dx_mm, dy_mm)
          return nil if seg_len_mm < 0.001

          ux = dx_mm / seg_len_mm
          uy = dy_mm / seg_len_mm
          nx = -uy
          ny = ux

          start_along_mm = distance_along_mm - (width_mm / 2.0)
          end_along_mm   = distance_along_mm + (width_mm / 2.0)
          base_z_mm      = s_mm[2] + sill_mm
          wall_t_mm      = wall_definition.thickness_mm || 100.0
          half_t_mm      = (wall_t_mm / 2.0) + 15.0

          c1_bot = [s_mm[0] + ux * start_along_mm - nx * half_t_mm, s_mm[1] + uy * start_along_mm - ny * half_t_mm, base_z_mm]
          c2_bot = [s_mm[0] + ux * start_along_mm + nx * half_t_mm, s_mm[1] + uy * start_along_mm + ny * half_t_mm, base_z_mm]
          c3_bot = [s_mm[0] + ux * end_along_mm + nx * half_t_mm,   s_mm[1] + uy * end_along_mm + ny * half_t_mm,   base_z_mm]
          c4_bot = [s_mm[0] + ux * end_along_mm - nx * half_t_mm,   s_mm[1] + uy * end_along_mm - ny * half_t_mm,   base_z_mm]

          b1 = Units.point_from_mm(c1_bot)
          b2 = Units.point_from_mm(c2_bot)
          b3 = Units.point_from_mm(c3_bot)
          b4 = Units.point_from_mm(c4_bot)

          h_su = Units.mm_to_su(height_mm)
          t1 = [b1[0], b1[1], b1[2] + h_su]
          t2 = [b2[0], b2[1], b2[2] + h_su]
          t3 = [b3[0], b3[1], b3[2] + h_su]
          t4 = [b4[0], b4[1], b4[2] + h_su]

          {
            type: :opening,
            width_mm: width_mm,
            height_mm: height_mm,
            sill_mm: sill_mm,
            wireframe_lines: [
              b1, b2, b2, b3, b3, b4, b4, b1,
              t1, t2, t2, t3, t3, t4, t4, t1,
              b1, t1, b2, t2, b3, t3, b4, t4,
              b2, t3, b3, t2, # X on outer face
              b1, t4, b4, t1  # X on inner face
            ],
            faces: [
              [t1, t2, t3, t4], [b1, b4, b3, b2],
              [b1, b2, t2, t1], [b2, b3, t3, t2],
              [b3, b4, t4, t3], [b4, b1, t1, t4]
            ],
            midpoint: [(b1[0] + b3[0]) / 2.0, (b1[1] + b3[1]) / 2.0, b1[2] + h_su + 2.0],
            label: "เจาะช่องเปิด: #{width_mm.to_i} x #{height_mm.to_i} mm (Sill: #{sill_mm.to_i} mm)"
          }
        end

        # --- 3. GHOST COLUMN ---
        def build_column_mesh(center_pt, section_mm, height_mm)
          c = to_coords(center_pt)
          hw_su = Units.mm_to_su(section_mm[0]) / 2.0
          hd_su = Units.mm_to_su(section_mm[1]) / 2.0
          h_su  = Units.mm_to_su(height_mm)

          b1 = [c[0] - hw_su, c[1] - hd_su, c[2]]
          b2 = [c[0] + hw_su, c[1] - hd_su, c[2]]
          b3 = [c[0] + hw_su, c[1] + hd_su, c[2]]
          b4 = [c[0] - hw_su, c[1] + hd_su, c[2]]

          t1 = [b1[0], b1[1], c[2] + h_su]
          t2 = [b2[0], b2[1], c[2] + h_su]
          t3 = [b3[0], b3[1], c[2] + h_su]
          t4 = [b4[0], b4[1], c[2] + h_su]

          {
            type: :column,
            section_mm: section_mm,
            height_mm: height_mm,
            wireframe_lines: [
              b1, b2, b2, b3, b3, b4, b4, b1,
              t1, t2, t2, t3, t3, t4, t4, t1,
              b1, t1, b2, t2, b3, t3, b4, t4,
              b1, b3, b2, b4,
              t1, t3, t2, t4
            ],
            faces: [
              [t1, t2, t3, t4], [b1, b4, b3, b2],
              [b1, b2, t2, t1], [b2, b3, t3, t2],
              [b3, b4, t4, t3], [b4, b1, t1, t4]
            ],
            midpoint: [c[0], c[1], c[2] + h_su + 2.0],
            label: "เสา คสล.: #{section_mm[0].to_i}x#{section_mm[1].to_i} mm (สูง #{height_mm.to_i} mm)"
          }
        end

        # --- 4. GHOST FOUNDATION FOOTING ---
        def build_foundation_mesh(center_pt, size_mm)
          c = to_coords(center_pt)
          hw_su = Units.mm_to_su(size_mm[0]) / 2.0
          hl_su = Units.mm_to_su(size_mm[1]) / 2.0
          d_su  = Units.mm_to_su(size_mm[2])

          # Top face at ground/base level
          t1 = [c[0] - hw_su, c[1] - hl_su, c[2]]
          t2 = [c[0] + hw_su, c[1] - hl_su, c[2]]
          t3 = [c[0] + hw_su, c[1] + hl_su, c[2]]
          t4 = [c[0] - hw_su, c[1] + hl_su, c[2]]

          # Base face downwards into soil
          b1 = [t1[0], t1[1], c[2] - d_su]
          b2 = [t2[0], t2[1], c[2] - d_su]
          b3 = [t3[0], t3[1], c[2] - d_su]
          b4 = [t4[0], t4[1], c[2] - d_su]

          {
            type: :foundation,
            size_mm: size_mm,
            wireframe_lines: [
              t1, t2, t2, t3, t3, t4, t4, t1,
              b1, b2, b2, b3, b3, b4, b4, b1,
              t1, b1, t2, b2, t3, b3, t4, b4,
              t1, t3, t2, t4
            ],
            faces: [
              [t1, t2, t3, t4], [b1, b4, b3, b2],
              [t1, t2, b2, b1], [t2, t3, b3, b2],
              [t3, t4, b4, b3], [t4, t1, b1, b4]
            ],
            midpoint: [c[0], c[1], c[2] + 2.0],
            label: "ฐานราก: #{size_mm[0].to_i}x#{size_mm[1].to_i} mm (หนา #{size_mm[2].to_i} mm)"
          }
        end

        # --- 5. GHOST MANHOLE ---
        def build_manhole_mesh(center_pt, size_mm, depth_mm = 800.0)
          c = to_coords(center_pt)
          hw_su = Units.mm_to_su(size_mm[0]) / 2.0
          hd_su = Units.mm_to_su(size_mm[1]) / 2.0
          dep_su = Units.mm_to_su(depth_mm)

          t1 = [c[0] - hw_su, c[1] - hd_su, c[2]]
          t2 = [c[0] + hw_su, c[1] - hd_su, c[2]]
          t3 = [c[0] + hw_su, c[1] + hd_su, c[2]]
          t4 = [c[0] - hw_su, c[1] + hd_su, c[2]]

          b1 = [t1[0], t1[1], c[2] - dep_su]
          b2 = [t2[0], t2[1], c[2] - dep_su]
          b3 = [t3[0], t3[1], c[2] - dep_su]
          b4 = [t4[0], t4[1], c[2] - dep_su]

          {
            type: :manhole,
            size_mm: size_mm,
            depth_mm: depth_mm,
            wireframe_lines: [
              t1, t2, t2, t3, t3, t4, t4, t1,
              b1, b2, b2, b3, b3, b4, b4, b1,
              t1, b1, t2, b2, t3, b3, t4, b4,
              t1, t3, t2, t4
            ],
            faces: [
              [t1, t2, t3, t4], [b1, b4, b3, b2],
              [t1, t2, b2, b1], [t2, t3, b3, b2],
              [t3, t4, b4, b3], [t4, t1, b1, b4]
            ],
            midpoint: [c[0], c[1], c[2] + 2.0],
            label: "บ่อพักน้ำทิ้ง: #{size_mm[0].to_i}x#{size_mm[1].to_i} mm (ลึก #{depth_mm.to_i} mm)"
          }
        end

        # --- 6. GHOST CABINET RUN ---
        def build_cabinet_mesh(origin_pt, width_mm, height_mm, depth_mm, module_count)
          o = to_coords(origin_pt)
          w_su = Units.mm_to_su(width_mm)
          d_su = Units.mm_to_su(depth_mm)
          h_su = Units.mm_to_su(height_mm)

          b1 = [o[0],        o[1],        o[2]]
          b2 = [o[0] + w_su, o[1],        o[2]]
          b3 = [o[0] + w_su, o[1] + d_su, o[2]]
          b4 = [o[0],        o[1] + d_su, o[2]]

          t1 = [b1[0], b1[1], o[2] + h_su]
          t2 = [b2[0], b2[1], o[2] + h_su]
          t3 = [b3[0], b3[1], o[2] + h_su]
          t4 = [b4[0], b4[1], o[2] + h_su]

          module_lines = []
          count = [module_count.to_i, 1].max
          if count > 1
            (1...count).each do |i|
              ratio = i.to_f / count
              div_x = o[0] + (w_su * ratio)
              mb_front = [div_x, o[1], o[2]]
              mt_front = [div_x, o[1], o[2] + h_su]
              mb_back  = [div_x, o[1] + d_su, o[2]]
              mt_back  = [div_x, o[1] + d_su, o[2] + h_su]
              module_lines.push(mb_front, mt_front, mb_front, mb_back, mt_front, mt_back)
            end
          end

          {
            type: :cabinet,
            width_mm: width_mm,
            height_mm: height_mm,
            depth_mm: depth_mm,
            module_count: count,
            wireframe_lines: [
              b1, b2, b2, b3, b3, b4, b4, b1,
              t1, t2, t2, t3, t3, t4, t4, t1,
              b1, t1, b2, t2, b3, t3, b4, t4,
              *module_lines
            ],
            faces: [
              [t1, t2, t3, t4], [b1, b4, b3, b2],
              [b1, b2, t2, t1], [b2, b3, t3, t2],
              [b3, b4, t4, t3], [b4, b1, t1, t4]
            ],
            midpoint: [o[0] + (w_su / 2.0), o[1] + (d_su / 2.0), o[2] + h_su + 2.0],
            label: "เคาน์เตอร์บิวท์อิน: #{width_mm.to_i}x#{height_mm.to_i}x#{depth_mm.to_i} mm (#{count} ช่อง)"
          }
        end

        # --- 7. GHOST WARDROBE ---
        def build_wardrobe_mesh(origin_pt, width_mm, height_mm, depth_mm, door_type = 'hinged')
          o = to_coords(origin_pt)
          w_su = Units.mm_to_su(width_mm)
          d_su = Units.mm_to_su(depth_mm)
          h_su = Units.mm_to_su(height_mm)
          p_su = Units.mm_to_su(80.0) # plinth 80mm

          b1 = [o[0],        o[1],        o[2]]
          b2 = [o[0] + w_su, o[1],        o[2]]
          b3 = [o[0] + w_su, o[1] + d_su, o[2]]
          b4 = [o[0],        o[1] + d_su, o[2]]

          t1 = [b1[0], b1[1], o[2] + h_su]
          t2 = [b2[0], b2[1], o[2] + h_su]
          t3 = [b3[0], b3[1], o[2] + h_su]
          t4 = [b4[0], b4[1], o[2] + h_su]

          # Plinth kick-plate line
          pl1 = [b1[0], b1[1], o[2] + p_su]
          pl2 = [b2[0], b2[1], o[2] + p_su]

          # Center door split line
          mid_x = o[0] + (w_su / 2.0)
          d_split_b = [mid_x, o[1], o[2] + p_su]
          d_split_t = [mid_x, o[1], o[2] + h_su]

          {
            type: :wardrobe,
            width_mm: width_mm,
            height_mm: height_mm,
            depth_mm: depth_mm,
            wireframe_lines: [
              b1, b2, b2, b3, b3, b4, b4, b1,
              t1, t2, t2, t3, t3, t4, t4, t1,
              b1, t1, b2, t2, b3, t3, b4, t4,
              pl1, pl2,
              d_split_b, d_split_t
            ],
            faces: [
              [t1, t2, t3, t4], [b1, b4, b3, b2],
              [b1, b2, t2, t1], [b2, b3, t3, t2],
              [b3, b4, t4, t3], [b4, b1, t1, t4]
            ],
            midpoint: [o[0] + (w_su / 2.0), o[1] + (d_su / 2.0), o[2] + h_su + 2.0],
            label: "ตู้เสื้อผ้า: #{width_mm.to_i}x#{height_mm.to_i}x#{depth_mm.to_i} mm (#{door_type == 'sliding' ? 'บานเลื่อน' : 'บานเปิด'})"
          }
        end

        # --- 8. GHOST PIPE ROUTE ---
        def build_pipe_mesh(start_pt, end_pt, diameter_mm = 100.0)
          s = to_coords(start_pt)
          e = to_coords(end_pt)
          dx = e[0] - s[0]
          dy = e[1] - s[1]
          dz = e[2] - s[2]
          len_su = Math.hypot(Math.hypot(dx, dy), dz)
          return nil if len_su < 0.001

          dist_xy_mm = Units.su_to_mm(Math.hypot(dx, dy))
          dz_mm = Units.su_to_mm(dz)
          slope_pct = dist_xy_mm.positive? ? (dz_mm.abs / dist_xy_mm * 100.0).round(1) : 0.0

          {
            type: :pipe,
            wireframe_lines: [s, e],
            diameter_mm: diameter_mm,
            slope_pct: slope_pct,
            midpoint: [(s[0] + e[0]) / 2.0, (s[1] + e[1]) / 2.0, (s[2] + e[2]) / 2.0 + 1.0],
            label: "แนวท่อระบายน้ำ: Ø#{diameter_mm.to_i} mm (ลาดเอียง Slope #{slope_pct}%)"
          }
        end

        # --- 9. GHOST CONDUIT ROUTE ---
        def build_conduit_mesh(start_pt, end_pt, ceiling_z_mm = 2600.0)
          s = to_coords(start_pt)
          e = to_coords(end_pt)
          cz_su = Units.mm_to_su(ceiling_z_mm)

          # 3D Path: Up to ceiling -> Across ceiling -> Down to end
          p1 = s
          p2 = [s[0], s[1], cz_su]
          p3 = [e[0], e[1], cz_su]
          p4 = e

          {
            type: :conduit,
            wireframe_lines: [p1, p2, p2, p3, p3, p4],
            midpoint: [(s[0] + e[0]) / 2.0, (s[1] + e[1]) / 2.0, cz_su + 1.0],
            label: "แนวท่อร้อยสายไฟ (ระดับฝ้าเพดาน #{ceiling_z_mm.to_i} mm)"
          }
        end

        # --- 10. GHOST CATALOG ASSET ---
        def build_asset_mesh(origin_pt, asset_id = 'Asset', size_mm = [600, 600, 800], rotation_deg = 0.0)
          o = to_coords(origin_pt)
          w_su = Units.mm_to_su(size_mm[0])
          d_su = Units.mm_to_su(size_mm[1])
          h_su = Units.mm_to_su(size_mm[2])

          # 2D orientation box
          rad = rotation_deg * Math::PI / 180.0
          cos_a = Math.cos(rad)
          sin_a = Math.sin(rad)

          rotate_pt = lambda do |lx, ly, lz|
            rx = lx * cos_a - ly * sin_a
            ry = lx * sin_a + ly * cos_a
            [o[0] + rx, o[1] + ry, o[2] + lz]
          end

          b1 = rotate_pt.call(-w_su / 2.0, -d_su / 2.0, 0)
          b2 = rotate_pt.call(w_su / 2.0,  -d_su / 2.0, 0)
          b3 = rotate_pt.call(w_su / 2.0,   d_su / 2.0, 0)
          b4 = rotate_pt.call(-w_su / 2.0,  d_su / 2.0, 0)

          t1 = rotate_pt.call(-w_su / 2.0, -d_su / 2.0, h_su)
          t2 = rotate_pt.call(w_su / 2.0,  -d_su / 2.0, h_su)
          t3 = rotate_pt.call(w_su / 2.0,   d_su / 2.0, h_su)
          t4 = rotate_pt.call(-w_su / 2.0,  d_su / 2.0, h_su)

          # Forward direction arrow
          arr_tip = rotate_pt.call(0, d_su / 2.0 + 4.0, 0)
          arr_mid = rotate_pt.call(0, 0, 0)

          {
            type: :asset,
            wireframe_lines: [
              b1, b2, b2, b3, b3, b4, b4, b1,
              t1, t2, t2, t3, t3, t4, t4, t1,
              b1, t1, b2, t2, b3, t3, b4, t4,
              arr_mid, arr_tip
            ],
            faces: [
              [t1, t2, t3, t4], [b1, b4, b3, b2],
              [b1, b2, t2, t1], [b2, b3, t3, t2],
              [b3, b4, t4, t3], [b4, b1, t1, t4]
            ],
            midpoint: [o[0], o[1], o[2] + h_su + 2.0],
            label: "ครุภัณฑ์: #{asset_id} (หมุน #{rotation_deg.to_i}°)"
          }
        end

        # --- 11. GHOST DOOR/WINDOW ON OPENING ---
        def build_door_window_mesh(opening_object, category = 'door', operation = 'swing')
          bounds = opening_object.respond_to?(:entity) && opening_object.entity.respond_to?(:bounds) ? opening_object.entity.bounds : nil
          return nil unless bounds

          min_pt = to_coords(bounds.min)
          max_pt = to_coords(bounds.max)

          b1 = [min_pt[0], min_pt[1], min_pt[2]]
          b2 = [max_pt[0], min_pt[1], min_pt[2]]
          b3 = [max_pt[0], max_pt[1], min_pt[2]]
          b4 = [min_pt[0], max_pt[1], min_pt[2]]

          t1 = [min_pt[0], min_pt[1], max_pt[2]]
          t2 = [max_pt[0], min_pt[1], max_pt[2]]
          t3 = [max_pt[0], max_pt[1], max_pt[2]]
          t4 = [min_pt[0], max_pt[1], max_pt[2]]

          {
            type: :door_window,
            wireframe_lines: [
              b1, b2, b2, b3, b3, b4, b4, b1,
              t1, t2, t2, t3, t3, t4, t4, t1,
              b1, t1, b2, t2, b3, t3, b4, t4,
              # Diagonal swing or cross
              b1, t3, b2, t4
            ],
            faces: [
              [t1, t2, t3, t4], [b1, b4, b3, b2],
              [b1, b2, t2, t1], [b2, b3, t3, t2],
              [b3, b4, t4, t3], [b4, b1, t1, t4]
            ],
            midpoint: [(min_pt[0] + max_pt[0]) / 2.0, (min_pt[1] + max_pt[1]) / 2.0, max_pt[2] + 2.0],
            label: "ติดตั้ง: #{category == 'door' ? 'ประตู' : 'หน้าต่าง'} (#{operation})"
          }
        end

        # --- VIEW RENDERING ENGINE ---
        def render_ghost(view, mesh, face_color:, line_color:, label: nil, centerlines: nil)
          return unless view && mesh

          # 1. Translucent solid volume fill
          if view.respond_to?(:drawing_color=) && view.respond_to?(:draw)
            view.drawing_color = face_color
            mesh[:faces]&.each do |face_pts|
              view.draw(GL_POLYGON_MODE, face_pts)
            end

            # 2. Crisp wireframe outline
            view.drawing_color = line_color
            view.line_width = 2 if view.respond_to?(:line_width=)
            view.line_stipple = '' if view.respond_to?(:line_stipple=)
            view.draw(GL_LINES_MODE, mesh[:wireframe_lines]) if mesh[:wireframe_lines]

            # 3. Centerlines or Alignment axes
            if centerlines && !centerlines.empty?
              view.drawing_color = [231, 76, 60]
              view.line_stipple = '-' if view.respond_to?(:line_stipple=)
              view.line_width = 2 if view.respond_to?(:line_width=)
              view.draw(GL_LINES_MODE, centerlines)
            end
          end

          # 4. Floating HUD dimension tag
          text_to_draw = label || mesh[:label]
          if text_to_draw && view.respond_to?(:draw_text)
            screen_pt = if view.respond_to?(:screen_coords) && mesh[:midpoint]
                          view.screen_coords(mesh[:midpoint])
                        else
                          mesh[:midpoint]
                        end
            view.draw_text(screen_pt, text_to_draw) if screen_pt
          end
        rescue StandardError
          nil
        end
      end
    end
  end
end
