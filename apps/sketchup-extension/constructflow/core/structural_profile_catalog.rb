# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module StructuralProfileCatalog
        # ── 9-POINT ANCHOR ALIGNMENT DEFINITION ─────────────────────
        ANCHORS = %i[
          top_left    top_center    top_right
          middle_left center        middle_right
          bottom_left bottom_center bottom_right
        ].freeze

        # Calculates [dx_mm, dy_mm] offset relative to center (0, 0)
        # width_mm = X dimension, depth_mm = Y/Z dimension
        def self.anchor_offset(anchor, width_mm, depth_mm)
          w = Float(width_mm)
          d = Float(depth_mm)
          half_w = w / 2.0
          half_d = d / 2.0

          case (anchor || :center).to_sym
          when :top_left      then [-half_w,  half_d]
          when :top_center    then [0.0,      half_d]
          when :top_right     then [half_w,   half_d]
          when :middle_left   then [-half_w,  0.0]
          when :center        then [0.0,      0.0]
          when :middle_right  then [half_w,   0.0]
          when :bottom_left   then [-half_w, -half_d]
          when :bottom_center then [0.0,     -half_d]
          when :bottom_right  then [half_w,  -half_d]
          else [0.0, 0.0]
          end
        end

        # ── 1. REINFORCED CONCRETE (ค.ส.ล. มาตรฐานไทย) ─────────────
        RC_BEAMS = [
          { code: 'RC-B-0.15x0.30', name: 'คาน ค.ส.ล. B1 0.15 x 0.30 ม.', category: :rc_beam, width_mm: 150, depth_mm: 300, material: 'concrete_rc' },
          { code: 'RC-B-0.15x0.35', name: 'คาน ค.ส.ล. 0.15 x 0.35 ม.',    category: :rc_beam, width_mm: 150, depth_mm: 350, material: 'concrete_rc' },
          { code: 'RC-B-0.15x0.40', name: 'คาน ค.ส.ล. 0.15 x 0.40 ม.',    category: :rc_beam, width_mm: 150, depth_mm: 400, material: 'concrete_rc' },
          { code: 'RC-B-0.20x0.40', name: 'คาน ค.ส.ล. B2 0.20 x 0.40 ม.', category: :rc_beam, width_mm: 200, depth_mm: 400, material: 'concrete_rc' },
          { code: 'RC-B-0.20x0.45', name: 'คาน ค.ส.ล. 0.20 x 0.45 ม.',    category: :rc_beam, width_mm: 200, depth_mm: 450, material: 'concrete_rc' },
          { code: 'RC-B-0.20x0.50', name: 'คาน ค.ส.ล. B3 0.20 x 0.50 ม.', category: :rc_beam, width_mm: 200, depth_mm: 500, material: 'concrete_rc' },
          { code: 'RC-B-0.20x0.60', name: 'คาน ค.ส.ล. 0.20 x 0.60 ม.',    category: :rc_beam, width_mm: 200, depth_mm: 600, material: 'concrete_rc' },
          { code: 'RC-B-0.25x0.50', name: 'คาน ค.ส.ล. B4 0.25 x 0.50 ม.', category: :rc_beam, width_mm: 250, depth_mm: 500, material: 'concrete_rc' },
          { code: 'RC-B-0.25x0.60', name: 'คาน ค.ส.ล. B5 0.25 x 0.60 ม.', category: :rc_beam, width_mm: 250, depth_mm: 600, material: 'concrete_rc' },
          { code: 'RC-B-0.30x0.60', name: 'คาน ค.ส.ล. B6 0.30 x 0.60 ม.', category: :rc_beam, width_mm: 300, depth_mm: 600, material: 'concrete_rc' },
          { code: 'RC-GB-0.20x0.40', name: 'คานคอดิน GB 0.20 x 0.40 ม.', category: :rc_beam, width_mm: 200, depth_mm: 400, material: 'concrete_rc' },
          { code: 'RC-GB-0.20x0.50', name: 'คานคอดิน GB 0.20 x 0.50 ม.', category: :rc_beam, width_mm: 200, depth_mm: 500, material: 'concrete_rc' }
        ].freeze

        RC_COLUMNS = [
          { code: 'RC-C-0.15x0.15', name: 'เสาเอ็น ค.ส.ล. 0.15 x 0.15 ม.', category: :rc_column, width_mm: 150, depth_mm: 150, material: 'concrete_rc' },
          { code: 'RC-C-0.20x0.20', name: 'เสา ค.ส.ล. C1 0.20 x 0.20 ม.', category: :rc_column, width_mm: 200, depth_mm: 200, material: 'concrete_rc' },
          { code: 'RC-C-0.25x0.25', name: 'เสา ค.ส.ล. C2 0.25 x 0.25 ม.', category: :rc_column, width_mm: 250, depth_mm: 250, material: 'concrete_rc' },
          { code: 'RC-C-0.30x0.30', name: 'เสา ค.ส.ล. C3 0.30 x 0.30 ม.', category: :rc_column, width_mm: 300, depth_mm: 300, material: 'concrete_rc' },
          { code: 'RC-C-0.35x0.35', name: 'เสา ค.ส.ล. C4 0.35 x 0.35 ม.', category: :rc_column, width_mm: 350, depth_mm: 350, material: 'concrete_rc' },
          { code: 'RC-C-0.40x0.40', name: 'เสา ค.ส.ล. C5 0.40 x 0.40 ม.', category: :rc_column, width_mm: 400, depth_mm: 400, material: 'concrete_rc' }
        ].freeze

        # ── 2. WIDE FLANGE / H-BEAM (มอก. 1227-2558) ───────────────
        WIDE_FLANGE = [
          { code: 'WF-150x75',  name: 'WF 150x75x5x7 (14.0 kg/m)',   category: :steel_wf, width_mm: 75,  depth_mm: 150, weight_kg_m: 14.0,  shape: :i_shape, tw: 5.0, tf: 7.0 },
          { code: 'H-100x100',  name: 'H 100x100x6x8 (17.2 kg/m)',   category: :steel_wf, width_mm: 100, depth_mm: 100, weight_kg_m: 17.2,  shape: :h_shape, tw: 6.0, tf: 8.0 },
          { code: 'WF-200x100', name: 'WF 200x100x5.5x8 (21.3 kg/m)', category: :steel_wf, width_mm: 100, depth_mm: 200, weight_kg_m: 21.3,  shape: :i_shape, tw: 5.5, tf: 8.0 },
          { code: 'H-125x125',  name: 'H 125x125x6.5x9 (23.8 kg/m)', category: :steel_wf, width_mm: 125, depth_mm: 125, weight_kg_m: 23.8,  shape: :h_shape, tw: 6.5, tf: 9.0 },
          { code: 'WF-250x125', name: 'WF 250x125x6x9 (29.6 kg/m)',  category: :steel_wf, width_mm: 125, depth_mm: 250, weight_kg_m: 29.6,  shape: :i_shape, tw: 6.0, tf: 9.0 },
          { code: 'H-150x150',  name: 'H 150x150x7x10 (31.5 kg/m)',  category: :steel_wf, width_mm: 150, depth_mm: 150, weight_kg_m: 31.5,  shape: :h_shape, tw: 7.0, tf: 10.0 },
          { code: 'WF-300x150', name: 'WF 300x150x6.5x9 (36.7 kg/m)', category: :steel_wf, width_mm: 150, depth_mm: 300, weight_kg_m: 36.7,  shape: :i_shape, tw: 6.5, tf: 9.0 },
          { code: 'H-200x200',  name: 'H 200x200x8x12 (49.9 kg/m)',  category: :steel_wf, width_mm: 200, depth_mm: 200, weight_kg_m: 49.9,  shape: :h_shape, tw: 8.0, tf: 12.0 },
          { code: 'WF-350x175', name: 'WF 350x175x7x11 (49.4 kg/m)', category: :steel_wf, width_mm: 175, depth_mm: 350, weight_kg_m: 49.4,  shape: :i_shape, tw: 7.0, tf: 11.0 },
          { code: 'H-250x250',  name: 'H 250x250x9x14 (72.4 kg/m)',  category: :steel_wf, width_mm: 250, depth_mm: 250, weight_kg_m: 72.4,  shape: :h_shape, tw: 9.0, tf: 14.0 },
          { code: 'WF-400x200', name: 'WF 400x200x8x13 (66.0 kg/m)', category: :steel_wf, width_mm: 200, depth_mm: 400, weight_kg_m: 66.0,  shape: :i_shape, tw: 8.0, tf: 13.0 },
          { code: 'H-300x300',  name: 'H 300x300x10x15 (94.0 kg/m)', category: :steel_wf, width_mm: 300, depth_mm: 300, weight_kg_m: 94.0,  shape: :h_shape, tw: 10.0, tf: 15.0 }
        ].freeze

        # ── 3. SQUARE HOLLOW SECTIONS (เหล็กกล่องสี่เหลี่ยม มอก. 107) ──
        STEEL_SHS = [
          { code: 'SHS-50x50x2.3',   name: 'เหล็กกล่อง 50x50x2.3 มม.',   category: :steel_box, width_mm: 50,  depth_mm: 50,  thickness_mm: 2.3, weight_kg_m: 3.34,  shape: :box_tube },
          { code: 'SHS-75x75x3.2',   name: 'เหล็กกล่อง 75x75x3.2 มม.',   category: :steel_box, width_mm: 75,  depth_mm: 75,  thickness_mm: 3.2, weight_kg_m: 6.89,  shape: :box_tube },
          { code: 'SHS-100x100x3.2', name: 'เหล็กกล่อง 100x100x3.2 มม.', category: :steel_box, width_mm: 100, depth_mm: 100, thickness_mm: 3.2, weight_kg_m: 9.40,  shape: :box_tube },
          { code: 'SHS-125x125x4.5', name: 'เหล็กกล่อง 125x125x4.5 มม.', category: :steel_box, width_mm: 125, depth_mm: 125, thickness_mm: 4.5, weight_kg_m: 16.40, shape: :box_tube },
          { code: 'SHS-150x150x4.5', name: 'เหล็กกล่อง 150x150x4.5 มม.', category: :steel_box, width_mm: 150, depth_mm: 150, thickness_mm: 4.5, weight_kg_m: 19.90, shape: :box_tube },
          { code: 'SHS-200x200x4.5', name: 'เหล็กกล่อง 200x200x4.5 มม.', category: :steel_box, width_mm: 200, depth_mm: 200, thickness_mm: 4.5, weight_kg_m: 27.00, shape: :box_tube }
        ].freeze

        # ── 4. RECTANGULAR HOLLOW SECTIONS (เหล็กกล่องแบน มอก. 107) ──
        STEEL_RHS = [
          { code: 'RHS-75x38x2.3',   name: 'เหล็กกล่องแบน 75x38x2.3 มม.',   category: :steel_rhs, width_mm: 38,  depth_mm: 75,  thickness_mm: 2.3, weight_kg_m: 3.86,  shape: :rect_tube },
          { code: 'RHS-100x50x3.2',  name: 'เหล็กกล่องแบน 100x50x3.2 มม.',  category: :steel_rhs, width_mm: 50,  depth_mm: 100, thickness_mm: 3.2, weight_kg_m: 6.89,  shape: :rect_tube },
          { code: 'RHS-125x75x3.2',  name: 'เหล็กกล่องแบน 125x75x3.2 มม.',  category: :steel_rhs, width_mm: 75,  depth_mm: 125, thickness_mm: 3.2, weight_kg_m: 9.40,  shape: :rect_tube },
          { code: 'RHS-150x50x3.2',  name: 'เหล็กกล่องแบน 150x50x3.2 มม.',  category: :steel_rhs, width_mm: 50,  depth_mm: 150, thickness_mm: 3.2, weight_kg_m: 9.40,  shape: :rect_tube },
          { code: 'RHS-150x75x4.5',  name: 'เหล็กกล่องแบน 150x75x4.5 มม.',  category: :steel_rhs, width_mm: 75,  depth_mm: 150, thickness_mm: 4.5, weight_kg_m: 14.80, shape: :rect_tube },
          { code: 'RHS-200x100x4.5', name: 'เหล็กกล่องแบน 200x100x4.5 มม.', category: :steel_rhs, width_mm: 100, depth_mm: 200, thickness_mm: 4.5, weight_kg_m: 20.00, shape: :rect_tube }
        ].freeze

        # ── 5. LIGHT LIP CHANNEL (เหล็กตัวซี โครงหลังคา มอก. 1228) ───
        STEEL_C_LIP = [
          { code: 'C-75x45x15x2.3',  name: 'แปตัวซี C 75x45x15x2.3 มม.',  category: :steel_lip_c, width_mm: 45, depth_mm: 75,  lip_mm: 15, thickness_mm: 2.3, weight_kg_m: 2.87, shape: :c_lip },
          { code: 'C-100x50x20x2.3', name: 'แปตัวซี C 100x50x20x2.3 มม.', category: :steel_lip_c, width_mm: 50, depth_mm: 100, lip_mm: 20, thickness_mm: 2.3, weight_kg_m: 3.77, shape: :c_lip },
          { code: 'C-100x50x20x3.2', name: 'จันทันซี C 100x50x20x3.2 มม.', category: :steel_lip_c, width_mm: 50, depth_mm: 100, lip_mm: 20, thickness_mm: 3.2, weight_kg_m: 5.06, shape: :c_lip },
          { code: 'C-125x50x20x3.2', name: 'จันทันซี C 125x50x20x3.2 มม.', category: :steel_lip_c, width_mm: 50, depth_mm: 125, lip_mm: 20, thickness_mm: 3.2, weight_kg_m: 5.69, shape: :c_lip },
          { code: 'C-150x50x20x3.2', name: 'จันทันซี C 150x50x20x3.2 มม.', category: :steel_lip_c, width_mm: 50, depth_mm: 150, lip_mm: 20, thickness_mm: 3.2, weight_kg_m: 6.32, shape: :c_lip },
          { code: 'C-150x65x20x3.2', name: 'จันทันซี C 150x65x20x3.2 มม.', category: :steel_lip_c, width_mm: 65, depth_mm: 150, lip_mm: 20, thickness_mm: 3.2, weight_kg_m: 7.07, shape: :c_lip }
        ].freeze

        # ── 6. STEEL CHANNEL (เหล็กรางน้ำ มอก. 1227) ─────────────────
        STEEL_CHANNEL = [
          { code: 'CH-75x40x5x7',     name: 'รางน้ำ CH 75x40x5x7 (6.92 kg/m)',    category: :steel_channel, width_mm: 40, depth_mm: 75,  weight_kg_m: 6.92,  shape: :u_channel },
          { code: 'CH-100x50x5x7.5',  name: 'รางน้ำ CH 100x50x5x7.5 (9.36 kg/m)', category: :steel_channel, width_mm: 50, depth_mm: 100, weight_kg_m: 9.36,  shape: :u_channel },
          { code: 'CH-125x65x6x8',    name: 'รางน้ำ CH 125x65x6x8 (13.4 kg/m)',   category: :steel_channel, width_mm: 65, depth_mm: 125, weight_kg_m: 13.4,  shape: :u_channel },
          { code: 'CH-150x75x6.5x10', name: 'รางน้ำ CH 150x75x6.5x10 (18.6 kg/m)', category: :steel_channel, width_mm: 75, depth_mm: 150, weight_kg_m: 18.6, shape: :u_channel },
          { code: 'CH-200x80x7.5x11', name: 'รางน้ำ CH 200x80x7.5x11 (24.6 kg/m)', category: :steel_channel, width_mm: 80, depth_mm: 200, weight_kg_m: 24.6, shape: :u_channel }
        ].freeze

        # ── 7. CIRCULAR HOLLOW SECTIONS / PIPE (ท่อกลม มอก. 107) ────
        STEEL_PIPE = [
          { code: 'PIPE-2"',   name: 'ท่อเหล็ก 2" (Ø60.5x2.3 มม.)',  category: :steel_pipe, width_mm: 60.5, depth_mm: 60.5, thickness_mm: 2.3, weight_kg_m: 3.30, shape: :round_pipe },
          { code: 'PIPE-2.5"', name: 'ท่อเหล็ก 2.5" (Ø76.3x2.8 มม.)', category: :steel_pipe, width_mm: 76.3, depth_mm: 76.3, thickness_mm: 2.8, weight_kg_m: 5.08, shape: :round_pipe },
          { code: 'PIPE-3"',   name: 'ท่อเหล็ก 3" (Ø89.1x3.2 มม.)',  category: :steel_pipe, width_mm: 89.1, depth_mm: 89.1, thickness_mm: 3.2, weight_kg_m: 6.78, shape: :round_pipe },
          { code: 'PIPE-4"',   name: 'ท่อเหล็ก 4" (Ø114.3x3.5 มม.)', category: :steel_pipe, width_mm: 114.3, depth_mm: 114.3, thickness_mm: 3.5, weight_kg_m: 9.56, shape: :round_pipe },
          { code: 'PIPE-5"',   name: 'ท่อเหล็ก 5" (Ø139.8x4.0 มม.)', category: :steel_pipe, width_mm: 139.8, depth_mm: 139.8, thickness_mm: 4.0, weight_kg_m: 13.4, shape: :round_pipe },
          { code: 'PIPE-6"',   name: 'ท่อเหล็ก 6" (Ø165.2x4.5 มม.)', category: :steel_pipe, width_mm: 165.2, depth_mm: 165.2, thickness_mm: 4.5, weight_kg_m: 17.8, shape: :round_pipe }
        ].freeze

        # ── 8. ARCHITECTURAL MOLDINGS & PROFILES (บัวสถาปัตย์) ──────
        MOLDINGS = [
          { code: 'SKIRT-100x15', name: 'บัวพื้นไม้สำเร็จรูป 4" (100x15 มม.)', category: :molding_skirting, width_mm: 15, depth_mm: 100, default_anchor: :bottom_left, material: 'wood' },
          { code: 'SKIRT-75x12',  name: 'บัวพื้น PVC 3" (75x12 มม.)',         category: :molding_skirting, width_mm: 12, depth_mm: 75,  default_anchor: :bottom_left, material: 'pvc' },
          { code: 'SKIRT-100x20', name: 'บัวพื้นไม้เนื้อแข็ง 4" (100x20 มม.)', category: :molding_skirting, width_mm: 20, depth_mm: 100, default_anchor: :bottom_left, material: 'wood' },
          { code: 'CORNICE-75x75', name: 'บัวฝ้าเพดานยิปซัม 3" (75x75 มม.)',    category: :molding_cornice,  width_mm: 75, depth_mm: 75,  default_anchor: :top_left,    material: 'plaster' },
          { code: 'CORNICE-100x100', name: 'บัวฝ้าคลาสสิก 4" (100x100 มม.)',   category: :molding_cornice,  width_mm: 100, depth_mm: 100, default_anchor: :top_left,   material: 'plaster' },
          { code: 'CASING-50x15', name: 'ซับวงกบประตู-หน้าต่าง 2" (50x15 มม.)', category: :molding_casing,   width_mm: 15, depth_mm: 50,  default_anchor: :middle_left, material: 'wood' },
          { code: 'CASING-70x20', name: 'ซับวงกบไม้โมเดิร์น 3" (70x20 มม.)',  category: :molding_casing,   width_mm: 20, depth_mm: 70,  default_anchor: :middle_left, material: 'wood' },
          { code: 'CHAIR-60x25',  name: 'บัวผนังกันกระแทก Chair Rail (60x25 มม.)', category: :molding_chair,  width_mm: 25, depth_mm: 60,  default_anchor: :middle_left, material: 'wood' },
          { code: 'HANDRAIL-75x40', name: 'ราวมือจับบันไดหลังเต่า (75x40 มม.)', category: :molding_handrail, width_mm: 75, depth_mm: 40,  default_anchor: :bottom_center, material: 'wood' },
          { code: 'HANDRAIL-50x50', name: 'ราวมือจับสแตนเลสกลม (Ø50 มม.)',      category: :molding_handrail, width_mm: 50, depth_mm: 50,  default_anchor: :bottom_center, material: 'steel' }
        ].freeze

        ALL_PROFILES = (RC_BEAMS + RC_COLUMNS + WIDE_FLANGE + STEEL_SHS + STEEL_RHS + STEEL_C_LIP + STEEL_CHANNEL + STEEL_PIPE + MOLDINGS).freeze

        def self.find_profile(code)
          ALL_PROFILES.find { |p| p[:code] == code.to_s.strip }
        end

        def self.profiles_by_category(category)
          ALL_PROFILES.select { |p| p[:category] == category.to_sym }
        end

        def self.categories
          ALL_PROFILES.map { |p| p[:category] }.uniq
        end
      end
    end
  end
end
