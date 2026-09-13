# frozen_string_literal: true

require_relative 'extension_presets_catalog'

unless Numeric.method_defined?(:m)
  class ::Numeric
    def m
      self * 39.37007874015748
    end

    def mm
      self * 0.03937007874015748
    end

    def cm
      self * 0.3937007874015748
    end
  end
end

module JiraNot
  module ConstructFlow
    module Extension
      class ExtensionPresetsBuilder
        def self.build_preset(preset_id, origin = [0, 0, 0], model = nil)
          model ||= (defined?(Sketchup) ? Sketchup.active_model : nil)
          return nil unless model

          preset = ExtensionPresetsCatalog.find(preset_id)
          raise ArgumentError, "Unknown preset: #{preset_id}" unless preset

          ox = origin.respond_to?(:x) ? origin.x : (origin[0] || 0.0)
          oy = origin.respond_to?(:y) ? origin.y : (origin[1] || 0.0)
          oz = origin.respond_to?(:z) ? origin.z : (origin[2] || 0.0)

          op_name = "ConstructFlow: #{preset[:title_th]}"
          model.start_operation(op_name, true) if model.respond_to?(:start_operation)

          tags = setup_tags(model)
          materials = setup_materials(model)

          parent_group = model.active_entities.add_group
          parent_group.name = "CF_Preset_#{preset[:id]}"
          parent_group.set_attribute('ConstructFlow', 'PresetId', preset[:id].to_s) rescue nil
          parent_group.set_attribute('ConstructFlow', 'Category', preset[:category].to_s) rescue nil

          entities = parent_group.entities

          case preset[:id].to_s
          when 'carport_standard'
            build_carport(entities, ox, oy, oz, tags, materials, preset)
          when 'thai_kitchen'
            build_thai_kitchen(entities, ox, oy, oz, tags, materials, preset)
          when 'garden_terrace'
            build_garden_terrace(entities, ox, oy, oz, tags, materials, preset)
          when 'multipurpose_suite'
            build_multipurpose_suite(entities, ox, oy, oz, tags, materials, preset)
          else
            raise ArgumentError, "No builder implemented for preset: #{preset[:id]}"
          end

          model.commit_operation if model.respond_to?(:commit_operation)
          parent_group
        end

        # ── 1. CARPORT 5.0 x 5.5 m ──────────────────────────────────
        def self.build_carport(entities, ox, oy, oz, tags, materials, preset)
          dims = preset[:dimensions]
          w = dims[:width_m].m
          d = dims[:depth_m].m
          h_front = dims[:height_front_m].m
          h_rear = dims[:height_rear_m].m

          # Floor Slab (Slab on ground 15cm)
          create_box(entities, ox, oy, oz, w, d, 0.15.m, tags[:floor], materials[:concrete])

          # 4 Steel Columns (SHS 125x125mm)
          col_sz = 0.125.m
          create_box(entities, ox + 0.1.m, oy + 0.1.m, oz + 0.15.m, col_sz, col_sz, h_front - 0.15.m, tags[:col], materials[:steel])
          create_box(entities, ox + w - col_sz - 0.1.m, oy + 0.1.m, oz + 0.15.m, col_sz, col_sz, h_front - 0.15.m, tags[:col], materials[:steel])
          create_box(entities, ox + 0.1.m, oy + d - col_sz - 0.1.m, oz + 0.15.m, col_sz, col_sz, h_rear - 0.15.m, tags[:col], materials[:steel])
          create_box(entities, ox + w - col_sz - 0.1.m, oy + d - col_sz - 0.1.m, oz + 0.15.m, col_sz, col_sz, h_rear - 0.15.m, tags[:col], materials[:steel])

          # Steel Beams RHS 150x50mm
          bm_w = 0.05.m
          bm_h = 0.15.m
          create_box(entities, ox, oy + 0.1.m, oz + h_front - bm_h, w, bm_w, bm_h, tags[:beam], materials[:steel])
          create_box(entities, ox, oy + d - 0.1.m - bm_w, oz + h_rear - bm_h, w, bm_w, bm_h, tags[:beam], materials[:steel])
          create_sloped_beam(entities, ox + 0.1.m, oy + 0.1.m, oz + h_front, oz + h_rear, d - 0.2.m, bm_w, bm_h, tags[:beam], materials[:steel])
          create_sloped_beam(entities, ox + w - 0.1.m - bm_w, oy + 0.1.m, oz + h_front, oz + h_rear, d - 0.2.m, bm_w, bm_h, tags[:beam], materials[:steel])

          # Sloped Roof Plane (Metalsheet with PU)
          roof_thick = 0.06.m
          create_sloped_roof(entities, ox - 0.2.m, oy - 0.2.m, oz + h_front + 0.05.m, oz + h_rear + 0.05.m, w + 0.4.m, d + 0.4.m, roof_thick, tags[:roof], materials[:roof_metal])

          # Gutter at the lower rear side
          create_box(entities, ox - 0.2.m, oy + d + 0.2.m, oz + h_rear - 0.15.m, w + 0.4.m, 0.15.m, 0.15.m, tags[:roof], materials[:fascia])
          create_box(entities, ox - 0.15.m, oy + d + 0.25.m, oz, 0.08.m, 0.08.m, h_rear, tags[:roof], materials[:steel])
        end

        # ── 2. THAI KITCHEN 2.5 x 5.0 m ─────────────────────────────
        def self.build_thai_kitchen(entities, ox, oy, oz, tags, materials, preset)
          dims = preset[:dimensions]
          w = dims[:width_m].m
          d = dims[:depth_m].m
          h_front = dims[:height_front_m].m
          h_rear = dims[:height_rear_m].m

          # Ground Beam & Floor Slab
          create_box(entities, ox, oy, oz, w, d, 0.15.m, tags[:floor], materials[:tile_room])

          # 4 RC Columns (200x200mm)
          col_sz = 0.20.m
          create_box(entities, ox, oy, oz + 0.15.m, col_sz, col_sz, h_front - 0.15.m, tags[:col], materials[:concrete])
          create_box(entities, ox + w - col_sz, oy, oz + 0.15.m, col_sz, col_sz, h_front - 0.15.m, tags[:col], materials[:concrete])
          create_box(entities, ox, oy + d - col_sz, oz + 0.15.m, col_sz, col_sz, h_rear - 0.15.m, tags[:col], materials[:concrete])
          create_box(entities, ox + w - col_sz, oy + d - col_sz, oz + 0.15.m, col_sz, col_sz, h_rear - 0.15.m, tags[:col], materials[:concrete])

          # Masonry Walls (AAC 7.5cm)
          wall_thk = 0.10.m
          create_box(entities, ox + col_sz, oy + d - wall_thk, oz + 0.15.m, w - 2*col_sz, wall_thk, h_rear - 0.15.m, tags[:wall], materials[:wall_white])
          create_rake_wall(entities, ox, oy + col_sz, d - 2*col_sz, wall_thk, oz + 0.15.m, oz + h_front, oz + h_rear, tags[:wall], materials[:wall_white])
          create_rake_wall(entities, ox + w - wall_thk, oy + col_sz, d - 2*col_sz, wall_thk, oz + 0.15.m, oz + h_front, oz + h_rear, tags[:wall], materials[:wall_white])

          # L-Shaped Kitchen Counter (ค.ส.ล. ปูกระเบื้อง สูง 0.85 ม.)
          cnt_h = 0.85.m
          cnt_d = 0.60.m
          create_box(entities, ox + col_sz, oy + d - cnt_d, oz + 0.15.m, w - 2*col_sz, cnt_d, cnt_h, tags[:wall], materials[:tile_terrace])
          create_box(entities, ox + wall_thk, oy + d - 1.8.m, oz + 0.15.m, cnt_d, 1.8.m - cnt_d, cnt_h, tags[:wall], materials[:tile_terrace])

          # Sink cutout representation
          create_box(entities, ox + 1.2.m, oy + d - cnt_d + 0.05.m, oz + 0.15.m + cnt_h, 0.80.m, 0.45.m, 0.02.m, tags[:open], materials[:steel])

          # Roof Structure
          roof_thick = 0.05.m
          create_sloped_roof(entities, ox - 0.3.m, oy - 0.3.m, oz + h_front + 0.1.m, oz + h_rear + 0.1.m, w + 0.6.m, d + 0.6.m, roof_thick, tags[:roof], materials[:roof_metal])
          create_box(entities, ox - 0.3.m, oy - 0.3.m, oz + h_front - 0.1.m, w + 0.6.m, 0.04.m, 0.20.m, tags[:roof], materials[:fascia])
        end

        # ── 3. GARDEN TERRACE & PERGOLA 3.0 x 4.0 m ─────────────────
        def self.build_garden_terrace(entities, ox, oy, oz, tags, materials, preset)
          dims = preset[:dimensions]
          w = dims[:width_m].m
          d = dims[:depth_m].m
          deck_h = dims[:terrace_level_m].m
          h = dims[:height_front_m].m

          # Deck Frame and WPC Plank Decking
          create_box(entities, ox, oy, oz, w, d, deck_h, tags[:floor], materials[:wood])

          # 2 Stairs steps in front (width 2.0m, run 0.30m, rise 0.10m)
          stair_w = 2.0.m
          stair_x = ox + (w - stair_w) / 2.0
          create_box(entities, stair_x, oy - 0.60.m, oz, stair_w, 0.30.m, 0.10.m, tags[:stair], materials[:wood])
          create_box(entities, stair_x, oy - 0.30.m, oz, stair_w, 0.30.m, 0.20.m, tags[:stair], materials[:wood])

          # 4 Steel Posts (100x100mm)
          col_sz = 0.10.m
          create_box(entities, ox + 0.05.m, oy + 0.05.m, oz + deck_h, col_sz, col_sz, h - deck_h, tags[:perg], materials[:steel])
          create_box(entities, ox + w - col_sz - 0.05.m, oy + 0.05.m, oz + deck_h, col_sz, col_sz, h - deck_h, tags[:perg], materials[:steel])
          create_box(entities, ox + 0.05.m, oy + d - col_sz - 0.05.m, oz + deck_h, col_sz, col_sz, h - deck_h, tags[:perg], materials[:steel])
          create_box(entities, ox + w - col_sz - 0.05.m, oy + d - col_sz - 0.05.m, oz + deck_h, col_sz, col_sz, h - deck_h, tags[:perg], materials[:steel])

          # Overhead Steel Header Beams
          bm_sz = 0.10.m
          create_box(entities, ox, oy, oz + h - bm_sz, w, bm_sz, bm_sz, tags[:perg], materials[:steel])
          create_box(entities, ox, oy + d - bm_sz, oz + h - bm_sz, w, bm_sz, bm_sz, tags[:perg], materials[:steel])
          create_box(entities, ox, oy, oz + h - bm_sz, bm_sz, d, bm_sz, tags[:perg], materials[:steel])
          create_box(entities, ox + w - bm_sz, oy, oz + h - bm_sz, bm_sz, d, bm_sz, tags[:perg], materials[:steel])

          # 9 WPC Teak Battens / Louvers
          9.times do |i|
            by = oy + 0.30.m + (i * 0.30.m)
            create_box(entities, ox + 0.05.m, by, oz + h, w - 0.10.m, 0.05.m, 0.08.m, tags[:perg], materials[:wood])
          end

          # Translucent Polycarbonate Canopy
          create_box(entities, ox - 0.15.m, oy - 0.15.m, oz + h + 0.08.m, w + 0.30.m, d + 0.30.m, 0.008.m, tags[:roof], materials[:glass])
        end

        # ── 4. MULTIPURPOSE SUITE 4.0 x 6.0 m ───────────────────────
        def self.build_multipurpose_suite(entities, ox, oy, oz, tags, materials, preset)
          dims = preset[:dimensions]
          w = dims[:width_m].m
          d = dims[:depth_m].m
          h_front = dims[:height_front_m].m
          h_rear = dims[:height_rear_m].m

          floor_thk = 0.25.m
          create_box(entities, ox, oy, oz, w, d, floor_thk, tags[:floor], materials[:tile_room])

          col_sz = 0.20.m
          create_box(entities, ox, oy, oz + floor_thk, col_sz, col_sz, h_front - floor_thk, tags[:col], materials[:concrete])
          create_box(entities, ox + w - col_sz, oy, oz + floor_thk, col_sz, col_sz, h_front - floor_thk, tags[:col], materials[:concrete])
          create_box(entities, ox, oy + d - col_sz, oz + floor_thk, col_sz, col_sz, h_rear - floor_thk, tags[:col], materials[:concrete])
          create_box(entities, ox + w - col_sz, oy + d - col_sz, oz + floor_thk, col_sz, col_sz, h_rear - floor_thk, tags[:col], materials[:concrete])

          # Intermediate columns along 6m length
          create_box(entities, ox, oy + (d/2.0) - (col_sz/2.0), oz + floor_thk, col_sz, col_sz, ((h_front + h_rear)/2.0) - floor_thk, tags[:col], materials[:concrete])
          create_box(entities, ox + w - col_sz, oy + (d/2.0) - (col_sz/2.0), oz + floor_thk, col_sz, col_sz, ((h_front + h_rear)/2.0) - floor_thk, tags[:col], materials[:concrete])

          # Beams
          bm_w = 0.20.m
          bm_h = 0.35.m
          create_box(entities, ox, oy, oz + h_front, w, bm_w, bm_h, tags[:beam], materials[:concrete])
          create_box(entities, ox, oy + d - bm_w, oz + h_rear, w, bm_w, bm_h, tags[:beam], materials[:concrete])

          # Walls
          wall_thk = 0.10.m
          create_box(entities, ox + col_sz, oy + d - wall_thk, oz + floor_thk, w - 2*col_sz, wall_thk, h_rear - floor_thk, tags[:wall], materials[:wall_accent])

          door_w = 2.0.m
          door_h = 2.2.m
          door_x = ox + (w - door_w) / 2.0
          create_box(entities, ox + col_sz, oy, oz + floor_thk, door_x - (ox + col_sz), wall_thk, h_front - floor_thk, tags[:wall], materials[:wall_white])
          create_box(entities, door_x + door_w, oy, oz + floor_thk, (ox + w - col_sz) - (door_x + door_w), wall_thk, h_front - floor_thk, tags[:wall], materials[:wall_white])
          create_box(entities, door_x, oy, oz + floor_thk + door_h, door_w, wall_thk, h_front - floor_thk - door_h, tags[:wall], materials[:wall_white])
          create_sliding_door(entities, door_x, oy, oz + floor_thk, door_w, door_h, tags[:open], materials[:steel], materials[:glass])

          create_rake_wall(entities, ox, oy + col_sz, d - 2*col_sz, wall_thk, oz + floor_thk, oz + h_front, oz + h_rear, tags[:wall], materials[:wall_white])
          create_rake_wall(entities, ox + w - wall_thk, oy + col_sz, d - 2*col_sz, wall_thk, oz + floor_thk, oz + h_front, oz + h_rear, tags[:wall], materials[:wall_white])

          # Roof with Fascia
          roof_thick = 0.05.m
          create_sloped_roof(entities, ox - 0.4.m, oy - 0.4.m, oz + h_front + bm_h, oz + h_rear + bm_h, w + 0.8.m, d + 0.8.m, roof_thick, tags[:roof], materials[:roof_metal])

          fascia_h = 0.25.m
          create_box(entities, ox - 0.4.m, oy - 0.4.m, oz + h_front + bm_h - fascia_h + roof_thick, w + 0.8.m, 0.04.m, fascia_h, tags[:roof], materials[:fascia])
          create_sloped_beam(entities, ox - 0.4.m, oy - 0.4.m, oz + h_front + bm_h + roof_thick, oz + h_rear + bm_h + roof_thick, d + 0.8.m, 0.04.m, fascia_h, tags[:roof], materials[:fascia])
          create_sloped_beam(entities, ox + w + 0.36.m, oy - 0.4.m, oz + h_front + bm_h + roof_thick, oz + h_rear + bm_h + roof_thick, d + 0.8.m, 0.04.m, fascia_h, tags[:roof], materials[:fascia])
        end

        # ────────────────────────────────────────────────────────────
        # LOW-LEVEL BUILD HELPERS
        # ────────────────────────────────────────────────────────────
        def self.setup_tags(model)
          layers = model.layers
          {
            ground: layers['CF_00_Ground']     || layers.add('CF_00_Ground'),
            foot:   layers['CF_01_Foundation'] || layers.add('CF_01_Foundation'),
            col:    layers['CF_02_Column']     || layers.add('CF_02_Column'),
            beam:   layers['CF_03_Beam']       || layers.add('CF_03_Beam'),
            floor:  layers['CF_04_Floor']      || layers.add('CF_04_Floor'),
            wall:   layers['CF_05_Wall']       || layers.add('CF_05_Wall'),
            open:   layers['CF_06_Opening']    || layers.add('CF_06_Opening'),
            roof:   layers['CF_07_Roof']       || layers.add('CF_07_Roof'),
            perg:   layers['CF_08_Pergola']    || layers.add('CF_08_Pergola'),
            stair:  layers['CF_09_Stair']      || layers.add('CF_09_Stair'),
            dim:    layers['CF_10_Dimension']  || layers.add('CF_10_Dimension'),
            lvl:    layers['CF_11_Spot_Level'] || layers.add('CF_11_Spot_Level')
          }
        end

        def self.setup_materials(model)
          materials = model.materials
          {
            concrete:     get_mat(materials, 'CF_Mat_Concrete', [200, 205, 210]),
            wall_white:   get_mat(materials, 'CF_Mat_Wall_White', [245, 246, 248]),
            wall_accent:  get_mat(materials, 'CF_Mat_Wall_Charcoal', [65, 70, 78]),
            tile_room:    get_mat(materials, 'CF_Mat_Tile_Porcelain', [230, 232, 235]),
            tile_terrace: get_mat(materials, 'CF_Mat_Tile_Terrace', [180, 175, 168]),
            roof_metal:   get_mat(materials, 'CF_Mat_Metalsheet_Dark', [45, 52, 60]),
            fascia:       get_mat(materials, 'CF_Mat_Fascia_Black', [30, 33, 38]),
            steel:        get_mat(materials, 'CF_Mat_Steel_Black', [38, 42, 46]),
            glass:        get_mat(materials, 'CF_Mat_Glass_GreenTint', [145, 195, 210], 0.40),
            wood:         get_mat(materials, 'CF_Mat_Wood_Teak', [185, 120, 68])
          }
        end

        def self.get_mat(materials, name, rgb, alpha = 1.0)
          return nil unless materials
          mat = materials[name] || materials.add(name)
          if defined?(Sketchup::Color)
            mat.color = Sketchup::Color.new(rgb[0], rgb[1], rgb[2]) rescue nil
          end
          mat.alpha = alpha if alpha < 1.0 && mat.respond_to?(:alpha=)
          mat
        end

        def self.create_box(entities, x, y, z, width, depth, height, layer = nil, material = nil)
          return nil unless entities
          grp = entities.add_group
          pts = [
            Geom::Point3d.new(x, y, z),
            Geom::Point3d.new(x + width, y, z),
            Geom::Point3d.new(x + width, y + depth, z),
            Geom::Point3d.new(x, y + depth, z)
          ]
          face = grp.entities.add_face(pts)
          face.pushpull(height) if height != 0 && face && face.valid?
          grp.layer = layer if layer && grp.respond_to?(:layer=)
          grp.material = material if material && grp.respond_to?(:material=)
          grp
        end

        def self.create_sloped_roof(entities, x, y, z_front, z_back, width, depth, thickness, layer, material)
          return nil unless entities
          grp = entities.add_group
          p1 = Geom::Point3d.new(x, y, z_front)
          p2 = Geom::Point3d.new(x + width, y, z_front)
          p3 = Geom::Point3d.new(x + width, y + depth, z_back)
          p4 = Geom::Point3d.new(x, y + depth, z_back)

          face = grp.entities.add_face(p1, p2, p3, p4)
          face.pushpull(-thickness) if face && face.valid?
          grp.layer = layer if layer && grp.respond_to?(:layer=)
          grp.material = material if material && grp.respond_to?(:material=)
          grp
        end

        def self.create_rake_wall(entities, x, y_start, len_y, thick, z_base, z_low, z_high, layer, material)
          return nil unless entities
          grp = entities.add_group
          p1 = Geom::Point3d.new(x, y_start, z_base)
          p2 = Geom::Point3d.new(x, y_start + len_y, z_base)
          p3 = Geom::Point3d.new(x, y_start + len_y, z_high)
          p4 = Geom::Point3d.new(x, y_start, z_low)

          face = grp.entities.add_face(p1, p2, p3, p4)
          face.pushpull(thick) if face && face.valid?
          grp.layer = layer if layer && grp.respond_to?(:layer=)
          grp.material = material if material && grp.respond_to?(:material=)
          grp
        end

        def self.create_sloped_beam(entities, x, y, z1, z2, len_y, width, height, layer, material)
          return nil unless entities
          grp = entities.add_group
          p1 = Geom::Point3d.new(x, y, z1)
          p2 = Geom::Point3d.new(x, y + len_y, z2)
          p3 = Geom::Point3d.new(x, y + len_y, z2 - height)
          p4 = Geom::Point3d.new(x, y, z1 - height)

          face = grp.entities.add_face(p1, p2, p3, p4)
          face.pushpull(width) if face && face.valid?
          grp.layer = layer if layer && grp.respond_to?(:layer=)
          grp.material = material if material && grp.respond_to?(:material=)
          grp
        end

        def self.create_sliding_door(entities, x, y, z, w, h, layer, mat_frame, mat_glass)
          return nil unless entities
          grp = entities.add_group
          frame_thk = 0.08.m
          frame_w = 0.05.m

          create_box(grp.entities, x, y, z, frame_w, frame_thk, h, layer, mat_frame)
          create_box(grp.entities, x + w - frame_w, y, z, frame_w, frame_thk, h, layer, mat_frame)
          create_box(grp.entities, x, y, z + h - frame_w, w, frame_thk, frame_w, layer, mat_frame)

          panel_w = (w - frame_w) / 2.0
          create_box(grp.entities, x + 0.02.m, y + 0.01.m, z, panel_w, 0.03.m, h - frame_w, layer, mat_frame)
          create_box(grp.entities, x + 0.06.m, y + 0.02.m, z + 0.06.m, panel_w - 0.08.m, 0.01.m, h - frame_w - 0.12.m, layer, mat_glass)

          create_box(grp.entities, x + panel_w - 0.02.m, y + 0.04.m, z, panel_w, 0.03.m, h - frame_w, layer, mat_frame)
          create_box(grp.entities, x + panel_w + 0.02.m, y + 0.05.m, z + 0.06.m, panel_w - 0.08.m, 0.01.m, h - frame_w - 0.12.m, layer, mat_glass)

          grp.layer = layer if layer && grp.respond_to?(:layer=)
          grp
        end
      end
    end
  end
end
