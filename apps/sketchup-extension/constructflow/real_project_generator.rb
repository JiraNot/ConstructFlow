# frozen_string_literal: true

require 'sketchup.rb'

module JiraNot
  module ConstructFlow
    module RealProjectGenerator
      def self.generate_and_save!
        model = Sketchup.active_model
        return false unless model

        model.start_operation('ConstructFlow Premium Extension Project', true)

        # Clear existing entities for a pristine, professional build
        model.entities.clear!

        entities = model.active_entities
        layers = model.layers
        materials = model.materials

        # ── 1. SETUP BIM LAYERS (TAGS) ───────────────────────────────
        tag_ground = layers['CF_00_Ground']       || layers.add('CF_00_Ground')
        tag_foot   = layers['CF_01_Foundation']   || layers.add('CF_01_Foundation')
        tag_col    = layers['CF_02_Column']       || layers.add('CF_02_Column')
        tag_beam   = layers['CF_03_Beam']         || layers.add('CF_03_Beam')
        tag_floor  = layers['CF_04_Floor']        || layers.add('CF_04_Floor')
        tag_wall   = layers['CF_05_Wall']         || layers.add('CF_05_Wall')
        tag_open   = layers['CF_06_Opening']      || layers.add('CF_06_Opening')
        tag_roof   = layers['CF_07_Roof']         || layers.add('CF_07_Roof')
        tag_perg   = layers['CF_08_Pergola']      || layers.add('CF_08_Pergola')
        tag_stair  = layers['CF_09_Stair']        || layers.add('CF_09_Stair')
        tag_dim    = layers['CF_10_Dimension']    || layers.add('CF_10_Dimension')
        tag_lvl    = layers['CF_11_Spot_Level']   || layers.add('CF_11_Spot_Level')

        # ── 2. SETUP PROFESSIONAL ARCHITECTURAL MATERIALS ───────────
        mat_conc = get_or_create_material(materials, 'CF_Mat_Concrete', [200, 205, 210])
        mat_wall_white = get_or_create_material(materials, 'CF_Mat_Wall_White', [245, 246, 248])
        mat_wall_accent = get_or_create_material(materials, 'CF_Mat_Wall_Charcoal', [65, 70, 78])
        mat_tile_room = get_or_create_material(materials, 'CF_Mat_Tile_Porcelain', [230, 232, 235])
        mat_tile_terrace = get_or_create_material(materials, 'CF_Mat_Tile_Terrace', [180, 175, 168])
        mat_roof_metal = get_or_create_material(materials, 'CF_Mat_Metalsheet_Dark', [45, 52, 60])
        mat_fascia = get_or_create_material(materials, 'CF_Mat_Fascia_Black', [30, 33, 38])
        mat_steel = get_or_create_material(materials, 'CF_Mat_Steel_Black', [38, 42, 46])
        mat_glass = get_or_create_material(materials, 'CF_Mat_Glass_GreenTint', [145, 195, 210], 0.40)
        mat_wood = get_or_create_material(materials, 'CF_Mat_Wood_Teak', [185, 120, 68])
        mat_grass = get_or_create_material(materials, 'CF_Mat_Garden_Grass', [110, 160, 95])
        mat_paver = get_or_create_material(materials, 'CF_Mat_Ground_Paver', [165, 168, 170])

        # ── 3. PROJECT DIMENSIONS (Thai House Extension Standards) ───
        # Main Room: 4.00m width (X) x 5.00m length (Y: 0.0 to 5.0m)
        # Covered Terrace: 4.00m width (X) x 2.00m length (Y: -2.0 to 0.0m)
        # Total Footprint: 4.00m x 7.00m
        w = 4.0.m
        d_room = 5.0.m
        d_terrace = 2.0.m
        total_d = d_room + d_terrace # 7.0m

        col_sz = 0.20.m
        bm_w = 0.20.m
        bm_h = 0.35.m

        gl_z = 0.0.m             # Natural Ground Level ±0.00
        terrace_z = 0.20.m       # Terrace level +0.20m
        floor_z = 0.30.m         # Room floor level +0.30m
        roof_low_z = 3.20.m      # Front roof beam height +3.20m
        roof_high_z = 3.80.m     # Rear roof beam height +3.80m

        # ── 4. NATURAL GROUND & LANDSCAPE PLANE ───────────────────────
        # Garden lawn (10m x 12m)
        create_box(entities, -3.0.m, -4.5.m, -0.05.m, 10.0.m, 12.0.m, 0.05.m, tag_ground, mat_grass)
        # Walkway / apron around terrace
        create_box(entities, -0.6.m, -2.8.m, -0.01.m, 5.2.m, 3.4.m, 0.02.m, tag_ground, mat_paver)

        # ── 5. SUBSTRUCTURE: 6 FOOTINGS & STUMPS (UNDERGROUND!) ───────
        # 6 Grid Points:
        # P1(0, -2.0), P2(w - col_sz, -2.0) [Terrace Posts]
        # P3(0, 0.0),  P4(w - col_sz, 0.0)  [Room Front]
        # P5(0, d_room - col_sz), P6(w - col_sz, d_room - col_sz) [Room Rear]
        col_pts = [
          [0, -d_terrace],
          [w - col_sz, -d_terrace],
          [0, 0],
          [w - col_sz, 0],
          [0, d_room - col_sz],
          [w - col_sz, d_room - col_sz]
        ]

        foot_sz = 0.80.m
        foot_thk = 0.25.m
        foot_bot = -0.75.m

        col_pts.each do |cx, cy|
          fx = cx + (col_sz / 2.0) - (foot_sz / 2.0)
          fy = cy + (col_sz / 2.0) - (foot_sz / 2.0)
          # Underground Footing
          create_box(entities, fx, fy, foot_bot, foot_sz, foot_sz, foot_thk, tag_foot, mat_conc)
          # Underground Short Stump (from footing top to ground beam)
          create_box(entities, cx, cy, foot_bot + foot_thk, col_sz, col_sz, -foot_bot - foot_thk, tag_foot, mat_conc)
        end

        # ── 6. GROUND BEAMS (คานคอดิน นั่งบนดินพอดี Z=0.00 ถึง +0.30m) ─
        # Room perimeter ground beams
        create_box(entities, 0, 0, 0, w, bm_w, bm_h, tag_beam, mat_conc)
        create_box(entities, 0, d_room - bm_w, 0, w, bm_w, bm_h, tag_beam, mat_conc)
        create_box(entities, 0, 0, 0, bm_w, d_room, bm_h, tag_beam, mat_conc)
        create_box(entities, w - bm_w, 0, 0, bm_w, d_room, bm_h, tag_beam, mat_conc)

        # Terrace perimeter ground beams
        create_box(entities, 0, -d_terrace, 0, w, bm_w, 0.20.m, tag_beam, mat_conc)
        create_box(entities, 0, -d_terrace, 0, bm_w, d_terrace, 0.20.m, tag_beam, mat_conc)
        create_box(entities, w - bm_w, -d_terrace, 0, bm_w, d_terrace, 0.20.m, tag_beam, mat_conc)

        # ── 7. FLOOR SLABS & STAIRS ──────────────────────────────────
        # Main Room Floor (Elevated +0.30m, 10cm slab)
        create_box(entities, 0, 0, 0.20.m, w, d_room, 0.10.m, tag_floor, mat_tile_room)

        # Terrace Floor (Elevated +0.20m, 10cm slab, 10cm drop from room)
        create_box(entities, 0, -d_terrace, 0.10.m, w, d_terrace, 0.10.m, tag_floor, mat_tile_terrace)

        # 2-Step Entrance Stairs in front of terrace (width 2.00m)
        # Step 1 (+0.10m):
        create_box(entities, (w - 2.0.m)/2.0, -d_terrace - 0.60.m, 0, 2.0.m, 0.30.m, 0.10.m, tag_stair, mat_tile_terrace)
        # Step 2 (+0.20m flush to terrace):
        create_box(entities, (w - 2.0.m)/2.0, -d_terrace - 0.30.m, 0, 2.0.m, 0.30.m, 0.20.m, tag_stair, mat_tile_terrace)

        # ── 8. COLUMNS (เสาอาคาร และเสาเทอเรส) ───────────────────────
        # 4 Main Room RC Columns (from +0.30m up to roof beams)
        create_box(entities, 0, 0, floor_z, col_sz, col_sz, roof_low_z - floor_z, tag_col, mat_conc)
        create_box(entities, w - col_sz, 0, floor_z, col_sz, col_sz, roof_low_z - floor_z, tag_col, mat_conc)
        create_box(entities, 0, d_room - col_sz, floor_z, col_sz, col_sz, roof_high_z - floor_z, tag_col, mat_conc)
        create_box(entities, w - col_sz, d_room - col_sz, floor_z, col_sz, col_sz, roof_high_z - floor_z, tag_col, mat_conc)

        # 2 Modern Terrace Steel Posts (125x125mm Black Steel)
        post_sz = 0.125.m
        create_box(entities, 0.05.m, -d_terrace + 0.05.m, terrace_z, post_sz, post_sz, 2.60.m, tag_perg, mat_steel)
        create_box(entities, w - 0.05.m - post_sz, -d_terrace + 0.05.m, terrace_z, post_sz, post_sz, 2.60.m, tag_perg, mat_steel)

        # ── 9. UPPER ROOF BEAMS ──────────────────────────────────────
        # Front Roof Beam (at Z = 3.20m to 3.40m)
        create_box(entities, 0, 0, roof_low_z, w, bm_w, 0.20.m, tag_beam, mat_conc)
        # Rear Roof Beam (at Z = 3.80m to 4.00m)
        create_box(entities, 0, d_room - bm_w, roof_high_z, w, bm_w, 0.20.m, tag_beam, mat_conc)

        # ── 10. ENCLOSED WALLS & RAKE GABLES (NO GAPS UNDER ROOF!) ───
        wall_thk = 0.10.m

        # (A) Front Wall (Y = 0) with Modern Sliding Glass Door (2.00 x 2.20m)
        door_w = 2.00.m
        door_h = 2.20.m
        door_x = (w - door_w) / 2.0

        # Left front solid wall
        create_box(entities, col_sz, 0, floor_z, door_x - col_sz, wall_thk, roof_low_z - floor_z, tag_wall, mat_wall_white)
        # Right front solid wall
        create_box(entities, door_x + door_w, 0, floor_z, w - col_sz - (door_x + door_w), wall_thk, roof_low_z - floor_z, tag_wall, mat_wall_white)
        # Lintel wall above door
        create_box(entities, door_x, 0, floor_z + door_h, door_w, wall_thk, roof_low_z - (floor_z + door_h), tag_wall, mat_wall_white)

        # Build Door: Aluminum 2-panel sliding glass door
        create_sliding_door(entities, door_x, 0, floor_z, door_w, door_h, tag_open, mat_steel, mat_glass)

        # (B) Rear Accent Wall (Y = d_room - wall_thk, Height up to 3.80m)
        create_box(entities, col_sz, d_room - wall_thk, floor_z, w - (2 * col_sz), wall_thk, roof_high_z - floor_z, tag_wall, mat_wall_accent)

        # (C) Left Wall (X = 0): Sloped Rake Wall (height slopes from 3.20m to 3.80m seamlessly!)
        create_rake_wall(entities, 0, col_sz, d_room - (2 * col_sz), wall_thk, floor_z, roof_low_z, roof_high_z, tag_wall, mat_wall_white)

        # (D) Right Wall (X = w - wall_thk): Sloped Rake Wall with Picture Garden Window (2.00 x 1.40m)
        win_w = 2.00.m
        win_h = 1.40.m
        win_y = (d_room - win_w) / 2.0
        win_sill = 0.85.m # Sill height from floor

        create_rake_wall_with_window(
          entities, w - wall_thk, col_sz, d_room - (2 * col_sz), wall_thk,
          floor_z, roof_low_z, roof_high_z,
          win_y - col_sz, win_w, win_sill, win_h,
          tag_wall, mat_wall_white
        )

        # Build Window: Modern Black Aluminum Picture/Sliding Window
        create_window_frame(entities, w - wall_thk, win_y, floor_z + win_sill, win_w, win_h, tag_open, mat_steel, mat_glass)

        # ── 11. MODERN SHED ROOF WITH FASCIA BOX (3-SIDED FASCIA) ────
        # Roof overhangs 0.40m all around
        roof_x = -0.40.m
        roof_y = -0.40.m
        roof_w = w + 0.80.m
        roof_d = d_room + 0.80.m
        z_front = roof_low_z + 0.20.m
        z_back = roof_high_z + 0.20.m
        roof_thick = 0.05.m

        # 1. Steel purlins under roof
        [0.0.m, 1.6.m, 3.2.m, 4.8.m].each do |py|
          pz = z_front + ((z_back - z_front) * (py / roof_d))
          create_box(entities, 0, py, pz - 0.10.m, w, 0.05.m, 0.10.m, tag_roof, mat_steel)
        end

        # 2. Main Sloped Roof Slab
        create_sloped_roof(entities, roof_x, roof_y, z_front, z_back, roof_w, roof_d, roof_thick, tag_roof, mat_roof_metal)

        # 3. Modern Fascia Board (เชิงชายสีดำ ปิดขอบหน้าและข้าง 2 ด้าน)
        fascia_h = 0.22.m
        # Front Fascia
        create_box(entities, roof_x, roof_y, z_front - fascia_h + roof_thick, roof_w, 0.04.m, fascia_h, tag_roof, mat_fascia)
        # Left Fascia
        create_sloped_fascia(entities, roof_x, roof_y, z_front, z_back, roof_d, 0.04.m, fascia_h, tag_roof, mat_fascia)
        # Right Fascia
        create_sloped_fascia(entities, roof_x + roof_w - 0.04.m, roof_y, z_front, z_back, roof_d, 0.04.m, fascia_h, tag_roof, mat_fascia)

        # 4. Concealed Rear Gutter & Downspout (รางระบายน้ำฝนและท่อน้ำทิ้งแนวดิ่ง)
        create_box(entities, roof_x, roof_y + roof_d, z_back - 0.18.m, roof_w, 0.18.m, 0.18.m, tag_roof, mat_fascia)
        # Vertical Downspout pipe down to ground
        create_box(entities, roof_x + 0.05.m, roof_y + roof_d + 0.02.m, 0, 0.08.m, 0.08.m, z_back - 0.18.m, tag_roof, mat_steel)

        # ── 12. TERRACE PERGOLA CANOPY (ระแนงกันสาดบังแดดไม้เทียม) ────
        # Horizontal steel support beams (Connecting posts to main wall)
        canopy_z = 2.70.m
        create_box(entities, 0.05.m, -d_terrace + 0.05.m, canopy_z, w - 0.10.m, 0.05.m, 0.10.m, tag_perg, mat_steel)
        create_box(entities, 0.05.m, -d_terrace + 0.05.m, canopy_z, 0.05.m, d_terrace - 0.05.m, 0.10.m, tag_perg, mat_steel)
        create_box(entities, w - 0.10.m, -d_terrace + 0.05.m, canopy_z, 0.05.m, d_terrace - 0.05.m, 0.10.m, tag_perg, mat_steel)

        # 7 Teak Wood Louver Battens (ระแนงไม้เทียมบังแดด)
        7.times do |i|
          ly = -d_terrace + 0.25.m + (i * 0.25.m)
          create_box(entities, 0.05.m, ly, canopy_z + 0.10.m, w - 0.10.m, 0.04.m, 0.08.m, tag_perg, mat_wood)
        end

        # ── 13. INTERIOR CEILING & SKIRTING ──────────────────────────
        # Ceiling at +2.80m
        create_box(entities, wall_thk, wall_thk, 2.80.m, w - (2 * wall_thk), d_room - (2 * wall_thk), 0.012.m, tag_floor, mat_wall_white)

        # ── 14. ANNOTATIONS: PROFESSIONAL DIMENSIONS & SPOT LEVELS ────
        # Width Dimension (Front, offset 1.20m away from building so no clipping!)
        dim_w = entities.add_dimension_linear(
          Geom::Point3d.new(0, -d_terrace - 1.0.m, 0),
          Geom::Point3d.new(w, -d_terrace - 1.0.m, 0),
          Geom::Vector3d.new(0, -0.4.m, 0)
        )
        dim_w.layer = tag_dim if dim_w

        # Depth Dimension (Left side, offset 1.20m away)
        dim_d = entities.add_dimension_linear(
          Geom::Point3d.new(-1.2.m, -d_terrace, 0),
          Geom::Point3d.new(-1.2.m, d_room, 0),
          Geom::Vector3d.new(-0.4.m, 0, 0)
        )
        dim_d.layer = tag_dim if dim_d

        # Height Dimension (Offset clear to the right)
        dim_h = entities.add_dimension_linear(
          Geom::Point3d.new(w + 1.2.m, 0, 0),
          Geom::Point3d.new(w + 1.2.m, 0, roof_low_z),
          Geom::Vector3d.new(0.4.m, 0, 0)
        )
        dim_h.layer = tag_dim if dim_h

        # Spot Levels with clean, non-clipping leader points
        add_level_tag(entities, '▼ FL. +0.30 (ระดับพื้นห้อง)', Geom::Point3d.new(w/2.0, d_room/2.0, floor_z), tag_lvl)
        add_level_tag(entities, '▼ TERRACE +0.20 (ระดับเฉลียง)', Geom::Point3d.new(w/2.0, -d_terrace/2.0, terrace_z), tag_lvl)
        add_level_tag(entities, '▼ GL. ±0.00 (ระดับดินเดิม)', Geom::Point3d.new(-1.5.m, -1.0.m, gl_z), tag_lvl)
        add_level_tag(entities, '▼ TOP BEAM +3.20 (ระดับหลังคาน)', Geom::Point3d.new(w, 0, roof_low_z), tag_lvl)
        add_level_tag(entities, '▼ TOP ROOF +4.05 (ระดับสันหลังคา)', Geom::Point3d.new(w/2.0, d_room, z_back + roof_thick), tag_lvl)

        # ── 15. CALIBRATED SCENES (FIXES ZOOM-OUT & SCENE SWITCHING!) ─
        tags = {
          ground: tag_ground, foot: tag_foot, col: tag_col, beam: tag_beam,
          floor: tag_floor, wall: tag_wall, open: tag_open, roof: tag_roof,
          perg: tag_perg, stair: tag_stair, dim: tag_dim, lvl: tag_lvl
        }
        configure_scenes(model, w, d_room, d_terrace, roof_low_z, roof_high_z, tags)

        model.commit_operation

        # ── 16. SAVE CLEAN .SKP TO DESKTOP & USERPROFILE ─────────────
        desktop_dir = Core::Paths.desktop_dir
        save_path = File.join(desktop_dir, 'ConstructFlow_Real_Project.skp')
        backup_path = File.join(Core::Paths.user_output_dir, 'ConstructFlow_Real_Project.skp')

        # Frame entire building in viewport before saving thumbnail
        begin
          model.active_view.zoom_extents
        rescue => e
          # ignore
        end

        model.save(save_path)
        model.save(backup_path)

        log_path = File.join(Core::Paths.user_output_dir, 'constructflow_skp_status.txt')
        File.write(log_path, "SUCCESS_PREMIUM: #{save_path} at #{Time.now}")

        puts "=========================================================="
        puts "  SUCCESSFULLY GENERATED PREMIUM CONSTRUCTFLOW .SKP!"
        puts "  Path: #{save_path}"
        puts "=========================================================="
        true
      end

      # ──────────────────────────────────────────────────────────────
      # GEOMETRY HELPERS
      # ──────────────────────────────────────────────────────────────
      def self.get_or_create_material(materials, name, rgb, alpha = 1.0)
        mat = materials[name] || materials.add(name)
        mat.color = Sketchup::Color.new(rgb[0], rgb[1], rgb[2])
        mat.alpha = alpha if alpha < 1.0
        mat
      end

      def self.create_box(entities, x, y, z, width, depth, height, layer = nil, material = nil)
        grp = entities.add_group
        pts = [
          Geom::Point3d.new(x, y, z),
          Geom::Point3d.new(x + width, y, z),
          Geom::Point3d.new(x + width, y + depth, z),
          Geom::Point3d.new(x, y + depth, z)
        ]
        face = grp.entities.add_face(pts)
        face.pushpull(height) if height != 0 && face && face.valid?
        grp.layer = layer if layer
        grp.material = material if material
        grp
      end

      def self.create_rake_wall(entities, x, y_start, len_y, thick, z_base, z_low, z_high, layer, material)
        grp = entities.add_group
        p1 = Geom::Point3d.new(x, y_start, z_base)
        p2 = Geom::Point3d.new(x, y_start + len_y, z_base)
        p3 = Geom::Point3d.new(x, y_start + len_y, z_high)
        p4 = Geom::Point3d.new(x, y_start, z_low)

        face = grp.entities.add_face(p1, p2, p3, p4)
        face.pushpull(thick) if face && face.valid?
        grp.layer = layer if layer
        grp.material = material if material
        grp
      end

      def self.create_rake_wall_with_window(entities, x, y_start, len_y, thick, z_base, z_low, z_high, win_rel_y, win_w, win_sill, win_h, layer, material)
        grp = entities.add_group
        p1 = Geom::Point3d.new(x, y_start, z_base)
        p2 = Geom::Point3d.new(x, y_start + len_y, z_base)
        p3 = Geom::Point3d.new(x, y_start + len_y, z_high)
        p4 = Geom::Point3d.new(x, y_start, z_low)

        face = grp.entities.add_face(p1, p2, p3, p4)

        # Window cutout
        wp1 = Geom::Point3d.new(x, y_start + win_rel_y, z_base + win_sill)
        wp2 = Geom::Point3d.new(x, y_start + win_rel_y + win_w, z_base + win_sill)
        wp3 = Geom::Point3d.new(x, y_start + win_rel_y + win_w, z_base + win_sill + win_h)
        wp4 = Geom::Point3d.new(x, y_start + win_rel_y, z_base + win_sill + win_h)
        wface = grp.entities.add_face(wp1, wp2, wp3, wp4)
        wface.erase! if wface && wface.valid?

        face.pushpull(thick) if face && face.valid?
        grp.layer = layer if layer
        grp.material = material if material
        grp
      end

      def self.create_sliding_door(entities, x, y, z, w, h, layer, mat_frame, mat_glass)
        grp = entities.add_group
        frame_thk = 0.08.m
        frame_w = 0.05.m

        # Outer Frame (Top, Left, Right)
        create_box(grp.entities, x, y, z, frame_w, frame_thk, h, layer, mat_frame)
        create_box(grp.entities, x + w - frame_w, y, z, frame_w, frame_thk, h, layer, mat_frame)
        create_box(grp.entities, x, y, z + h - frame_w, w, frame_thk, frame_w, layer, mat_frame)

        # 2 Glass Sliding Panels
        panel_w = (w - frame_w) / 2.0
        # Left fixed/sliding panel
        create_box(grp.entities, x + 0.02.m, y + 0.01.m, z, panel_w, 0.03.m, h - frame_w, layer, mat_frame)
        create_box(grp.entities, x + 0.06.m, y + 0.02.m, z + 0.06.m, panel_w - 0.08.m, 0.01.m, h - frame_w - 0.12.m, layer, mat_glass)

        # Right sliding panel (slightly offset)
        create_box(grp.entities, x + panel_w - 0.02.m, y + 0.04.m, z, panel_w, 0.03.m, h - frame_w, layer, mat_frame)
        create_box(grp.entities, x + panel_w + 0.02.m, y + 0.05.m, z + 0.06.m, panel_w - 0.08.m, 0.01.m, h - frame_w - 0.12.m, layer, mat_glass)

        grp.layer = layer if layer
        grp
      end

      def self.create_window_frame(entities, x, y, z, w, h, layer, mat_frame, mat_glass)
        grp = entities.add_group
        frame_thk = 0.10.m
        frame_w = 0.05.m

        # Outer Frame
        create_box(grp.entities, x, y, z, frame_thk, frame_w, h, layer, mat_frame)
        create_box(grp.entities, x, y + w - frame_w, z, frame_thk, frame_w, h, layer, mat_frame)
        create_box(grp.entities, x, y, z, frame_thk, w, frame_w, layer, mat_frame)
        create_box(grp.entities, x, y, z + h - frame_w, frame_thk, w, frame_w, layer, mat_frame)

        # Central mullion
        mid_y = y + (w / 2.0) - (frame_w / 2.0)
        create_box(grp.entities, x, mid_y, z, frame_thk, frame_w, h, layer, mat_frame)

        # 2 Glass panes
        glass_w = (w - (3 * frame_w)) / 2.0
        glass_h = h - (2 * frame_w)
        create_box(grp.entities, x + 0.04.m, y + frame_w, z + frame_w, 0.01.m, glass_w, glass_h, layer, mat_glass)
        create_box(grp.entities, x + 0.04.m, mid_y + frame_w, z + frame_w, 0.01.m, glass_w, glass_h, layer, mat_glass)

        # Exterior Sill (บัวขอบล่างกันน้ำซึม)
        create_box(grp.entities, x - 0.04.m, y - 0.05.m, z - 0.05.m, frame_thk + 0.08.m, w + 0.10.m, 0.05.m, layer, mat_frame)

        grp.layer = layer if layer
        grp
      end

      def self.create_sloped_roof(entities, x, y, z_front, z_back, width, depth, thickness, layer, material)
        grp = entities.add_group
        pts = [
          Geom::Point3d.new(x, y, z_front),
          Geom::Point3d.new(x + width, y, z_front),
          Geom::Point3d.new(x + width, y + depth, z_back),
          Geom::Point3d.new(x, y + depth, z_back)
        ]
        face = grp.entities.add_face(pts)
        face.pushpull(thickness) if face && face.valid?
        grp.layer = layer if layer
        grp.material = material if material
        grp
      end

      def self.create_sloped_fascia(entities, x, y, z_front, z_back, depth, thick, height, layer, material)
        grp = entities.add_group
        pts = [
          Geom::Point3d.new(x, y, z_front),
          Geom::Point3d.new(x, y + depth, z_back),
          Geom::Point3d.new(x, y + depth, z_back - height),
          Geom::Point3d.new(x, y, z_front - height)
        ]
        face = grp.entities.add_face(pts)
        face.pushpull(thick) if face && face.valid?
        grp.layer = layer if layer
        grp.material = material if material
        grp
      end

      def self.add_level_tag(entities, text, pt, layer)
        txt = entities.add_text(text, pt, Geom::Vector3d.new(0, 0, 0.35.m))
        txt.layer = layer if txt
        txt
      end

      # ──────────────────────────────────────────────────────────────
      # CALIBRATED SCENE CONFIGURATION (SOLVES ZOOM-OUT & SCENE SWITCHING!)
      # ──────────────────────────────────────────────────────────────
      def self.configure_scenes(model, w, d_room, d_terrace, h_low, h_high, tags)
        pages = model.pages
        center_x = w / 2.0
        center_y = (d_room - d_terrace) / 2.0
        center_z = h_low / 2.0
        center_pt = Geom::Point3d.new(center_x, center_y, center_z)

        # Disable slow transition animations for crisp, instant switching
        begin
          model.options['PageOptions']['ShowTransition'] = false
          model.options['PageOptions']['TransitionTime'] = 0.0
        rescue => e
          # ignore
        end

        flag_all = 1 | 2 | 4 | 8 | 16 | 32 | 64 | 128

        # ── 1. 01_แปลนพื้นสถาปัตย์_ต่อเติม (Floor Plan Top Ortho) ────
        s1 = pages['CF_01_แปลนสถาปัตย์_ต่อเติม'] || pages.add('CF_01_แปลนสถาปัตย์_ต่อเติม')
        s1.use_hidden_layers = true
        s1.camera.perspective = false
        s1.camera.set(Geom::Point3d.new(center_x, center_y, 30.m), center_pt, Geom::Vector3d.new(0, 1, 0))
        s1.camera.height = (d_room + d_terrace + 1.8.m) # Perfectly frames building on screen

        # Layer visibility: HIDE ROOF & PERGOLA so interior floor plan is seen!
        s1.set_visibility(tags[:ground], false)
        s1.set_visibility(tags[:foot], false)
        s1.set_visibility(tags[:col], true)
        s1.set_visibility(tags[:beam], false)
        s1.set_visibility(tags[:floor], true)
        s1.set_visibility(tags[:wall], true)
        s1.set_visibility(tags[:open], true)
        s1.set_visibility(tags[:roof], false) # HIDE ROOF!
        s1.set_visibility(tags[:perg], false) # HIDE PERGOLA!
        s1.set_visibility(tags[:stair], true)
        s1.set_visibility(tags[:dim], true)
        s1.set_visibility(tags[:lvl], true)
        s1.update(flag_all)

        # ── 2. 02_แปลนโครงสร้างและฐานราก (Structural Foundation Plan) ─
        s2 = pages['CF_02_แปลนโครงสร้างและฐานราก'] || pages.add('CF_02_แปลนโครงสร้างและฐานราก')
        s2.use_hidden_layers = true
        s2.camera.perspective = false
        s2.camera.set(Geom::Point3d.new(center_x, center_y, 30.m), center_pt, Geom::Vector3d.new(0, 1, 0))
        s2.camera.height = (d_room + d_terrace + 1.8.m)

        # Layer visibility: SHOW FOOTINGS, COLUMNS, BEAMS. HIDE WALLS & ROOF.
        s2.set_visibility(tags[:ground], false)
        s2.set_visibility(tags[:foot], true)  # SHOW UNDERGROUND FOOTINGS!
        s2.set_visibility(tags[:col], true)
        s2.set_visibility(tags[:beam], true)  # SHOW GROUND BEAMS!
        s2.set_visibility(tags[:floor], false)
        s2.set_visibility(tags[:wall], false) # HIDE WALLS!
        s2.set_visibility(tags[:open], false)
        s2.set_visibility(tags[:roof], false) # HIDE ROOF!
        s2.set_visibility(tags[:perg], false)
        s2.set_visibility(tags[:stair], false)
        s2.set_visibility(tags[:dim], true)
        s2.set_visibility(tags[:lvl], true)
        s2.update(flag_all)

        # ── 3. 03_แปลนหลังคาและระบายน้ำ (Roof Plan & Drainage) ────────
        s3 = pages['CF_03_แปลนหลังคาและระบายน้ำ'] || pages.add('CF_03_แปลนหลังคาและระบายน้ำ')
        s3.use_hidden_layers = true
        s3.camera.perspective = false
        s3.camera.set(Geom::Point3d.new(center_x, center_y, 30.m), center_pt, Geom::Vector3d.new(0, 1, 0))
        s3.camera.height = (d_room + d_terrace + 2.2.m)

        # Layer visibility: SHOW FINISHED ROOF, GUTTERS, PERGOLA
        s3.set_visibility(tags[:ground], false)
        s3.set_visibility(tags[:foot], false)
        s3.set_visibility(tags[:col], false)
        s3.set_visibility(tags[:beam], false)
        s3.set_visibility(tags[:floor], false)
        s3.set_visibility(tags[:wall], false)
        s3.set_visibility(tags[:open], false)
        s3.set_visibility(tags[:roof], true) # SHOW ROOF!
        s3.set_visibility(tags[:perg], true) # SHOW PERGOLA!
        s3.set_visibility(tags[:stair], false)
        s3.set_visibility(tags[:dim], true)
        s3.set_visibility(tags[:lvl], true)
        s3.update(flag_all)

        # ── 4. 04_รูปด้านหน้า (Front Elevation Ortho) ─────────────────
        s4 = pages['CF_04_รูปด้านหน้า_ต่อเติม'] || pages.add('CF_04_รูปด้านหน้า_ต่อเติม')
        s4.use_hidden_layers = true
        s4.camera.perspective = false
        s4.camera.set(Geom::Point3d.new(center_x, -d_terrace - 18.m, 2.0.m), Geom::Point3d.new(center_x, 0, 2.0.m), Geom::Vector3d.new(0, 0, 1))
        s4.camera.height = 5.6.m

        s4.set_visibility(tags[:ground], true)
        s4.set_visibility(tags[:foot], false)
        s4.set_visibility(tags[:col], true)
        s4.set_visibility(tags[:beam], true)
        s4.set_visibility(tags[:floor], true)
        s4.set_visibility(tags[:wall], true)
        s4.set_visibility(tags[:open], true)
        s4.set_visibility(tags[:roof], true)
        s4.set_visibility(tags[:perg], true)
        s4.set_visibility(tags[:stair], true)
        s4.set_visibility(tags[:dim], true)
        s4.set_visibility(tags[:lvl], true)
        s4.update(flag_all)

        # ── 5. 05_รูปตัดด้านข้าง_A (Section A Ortho) ───────────────────
        s5 = pages['CF_05_รูปตัด_A_ระดับพื้น'] || pages.add('CF_05_รูปตัด_A_ระดับพื้น')
        s5.use_hidden_layers = true
        s5.camera.perspective = false
        s5.camera.set(Geom::Point3d.new(-18.m, center_y, 2.0.m), Geom::Point3d.new(0, center_y, 2.0.m), Geom::Vector3d.new(0, 0, 1))
        s5.camera.height = 6.0.m

        s5.set_visibility(tags[:ground], true)
        s5.set_visibility(tags[:foot], true) # Show underground foundations in section!
        s5.set_visibility(tags[:col], true)
        s5.set_visibility(tags[:beam], true)
        s5.set_visibility(tags[:floor], true)
        s5.set_visibility(tags[:wall], true)
        s5.set_visibility(tags[:open], true)
        s5.set_visibility(tags[:roof], true)
        s5.set_visibility(tags[:perg], true)
        s5.set_visibility(tags[:stair], true)
        s5.set_visibility(tags[:dim], true)
        s5.set_visibility(tags[:lvl], true)
        s5.update(flag_all)

        # ── 6. 06_ภาพทัศนียภาพ_3D_Isometric (Perspective beauty view) ─
        s6 = pages['CF_06_ภาพทัศนียภาพ_3D_Isometric'] || pages.add('CF_06_ภาพทัศนียภาพ_3D_Isometric')
        s6.use_hidden_layers = true
        s6.camera.perspective = true
        s6.camera.set(
          Geom::Point3d.new(-7.0.m, -d_terrace - 6.5.m, 6.0.m),
          center_pt,
          Geom::Vector3d.new(0, 0, 1)
        )

        s6.set_visibility(tags[:ground], true)
        s6.set_visibility(tags[:foot], false) # underground
        s6.set_visibility(tags[:col], true)
        s6.set_visibility(tags[:beam], true)
        s6.set_visibility(tags[:floor], true)
        s6.set_visibility(tags[:wall], true)
        s6.set_visibility(tags[:open], true)
        s6.set_visibility(tags[:roof], true)
        s6.set_visibility(tags[:perg], true)
        s6.set_visibility(tags[:stair], true)
        s6.set_visibility(tags[:dim], false) # Clean 3D view without dimension clutter!
        s6.set_visibility(tags[:lvl], false)
        s6.update(flag_all)

        # Default to 3D scene on open
        pages.selected_page = s6
      end
    end
  end
end

if defined?(UI)
  UI.menu('Extensions').add_item('🏗️ ConstructFlow: สร้างและบันทึกโมเดลจริง (.SKP)') do
    JiraNot::ConstructFlow::RealProjectGenerator.generate_and_save!
    UI.messagebox("ConstructFlow: อัปเดตโมเดลสถาปัตย์สมบูรณ์และบันทึกไฟล์ .SKP สำเร็จเรียบร้อยบน Desktop!")
  end

  # Optional one-shot auto-generate when SketchUp opens.
  # Disabled by default: the legacy timer wiped and regenerated the active
  # model on every startup. Set CONSTRUCTFLOW_AUTO_PROJECT=1 to opt in.
  if ENV['CONSTRUCTFLOW_AUTO_PROJECT'] == '1'
    $cf_gen_timer = UI.start_timer(1.0, true) do
    model = Sketchup.active_model
    if model && model.active_entities
      log_path = File.join(Core::Paths.user_output_dir, 'constructflow_skp_status.txt')
      status = File.exist?(log_path) ? File.read(log_path) : ''
      unless status.include?('SUCCESS_PREMIUM')
        begin
          success = JiraNot::ConstructFlow::RealProjectGenerator.generate_and_save!
          UI.stop_timer($cf_gen_timer) if success
        rescue => e
          warn("ConstructFlow auto-generate failed: #{e.class}: #{e.message}")
          UI.stop_timer($cf_gen_timer)
        end
      else
        UI.stop_timer($cf_gen_timer)
      end
    end
    end
  end
end

