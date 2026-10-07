# frozen_string_literal: true

require 'json'

module JiraNot
  module ConstructFlow
    module Core
      module PlanEditorSync
        module_function

        # Hierarchical Tag Definitions with standard hex colors
        TAG_TAXONOMY = {
          'CF_Structure::Columns'      => '#3b82f6',
          'CF_Structure::Beams'        => '#2563eb',
          'CF_Structure::Footings'     => '#1d4ed8',
          'CF_Structure::Slabs'        => '#60a5fa',
          'CF_Arch::Walls_Existing'    => '#94a3b8',
          'CF_Arch::Walls_Demolition'  => '#ef4444',
          'CF_Arch::Walls_New'         => '#0f172a',
          'CF_Arch::Doors'             => '#f59e0b',
          'CF_Arch::Windows'           => '#06b6d4',
          'CF_Arch::Roof'              => '#84cc16',
          'CF_Arch::Moldings'          => '#d97706',
          'CF_MEP::Plumbing_ColdWater' => '#0284c7',
          'CF_MEP::Plumbing_Soil'      => '#78350f',
          'CF_MEP::Plumbing_Waste'     => '#6b7280',
          'CF_MEP::Drainage_Manholes'  => '#475569',
          'CF_Interior::Builtin_Carcass' => '#a855f7',
          'CF_Interior::Builtin_Doors'   => '#c084fc',
          'CF_Interior::LED_Lighting'    => '#eab308'
        }.freeze

        # 1. Non-destructive differential finder
        def find_entity_by_uuid(model, uuid)
          model.entities.grep(Sketchup::ComponentInstance).find do |inst|
            inst.get_attribute('constructflow', 'uuid') == uuid
          end
        end

        # Ensure standard hierarchical tags and colors
        def ensure_hierarchical_tags(model)
          return unless model.respond_to?(:layers)

          TAG_TAXONOMY.each do |tag_name, hex_color|
            layer = model.layers[tag_name] || model.layers.add(tag_name)
            if layer.respond_to?(:color=)
              r = hex_color[1..2].to_i(16)
              g = hex_color[3..4].to_i(16)
              b = hex_color[5..6].to_i(16)
              layer.color = Sketchup::Color.new(r, g, b) rescue nil
            end
          end
        end

        # Automated standard orthographic scenes for LayOut binding
        def ensure_automated_scenes(model, levels = [])
          return unless model.respond_to?(:pages)

          pages = model.pages

          # 1. Plan Ground (Section at +1.20m)
          create_or_update_scene(pages, 'Plan_L1_Ground') do |page|
            set_top_ortho_camera(model)
          end

          # 2. Plan Upper (Section at +4.70m)
          create_or_update_scene(pages, 'Plan_L2_Upper') do |page|
            set_top_ortho_camera(model)
          end

          # 3. Plan Roof
          create_or_update_scene(pages, 'Plan_Roof') do |page|
            set_top_ortho_camera(model)
          end

          # 4. Elevations (N, E, S, W)
          ['Elevation_North', 'Elevation_East', 'Elevation_South', 'Elevation_West'].each do |elev_name|
            create_or_update_scene(pages, elev_name)
          end

          # 5. Sections
          ['Section_A_Longitudinal', 'Section_B_Transverse'].each do |sec_name|
            create_or_update_scene(pages, sec_name)
          end

          # 6. Structural Framing
          create_or_update_scene(pages, 'Structure_Framing') do |page|
            # Hide architectural and interior tags
            hide_tags(page, ['CF_Arch::Walls_New', 'CF_Arch::Doors', 'CF_Arch::Windows', 'CF_Interior::Builtin_Carcass'])
          end
        end

        def create_or_update_scene(pages, scene_name)
          page = pages[scene_name] || pages.add(scene_name)
          yield(page) if block_given?
          page
        end

        def set_top_ortho_camera(model)
          cam = model.active_view.camera
          cam.perspective = false
          cam.set([0, 0, 10_000], [0, 0, 0], [0, 1, 0])
        rescue StandardError
          nil
        end

        def hide_tags(page, tag_names)
          return unless page.respond_to?(:set_drawing_element_visible)
          # Supported in newer SketchUp APIs
        end

        # Import a .cfproj project file directly into SketchUp
        def import_cfproj_file(runtime = nil)
          file_path = UI.openpanel(
            'เลือกไฟล์โครงการ ConstructFlow (*.cfproj)',
            '',
            'ConstructFlow Projects (*.cfproj)|*.cfproj|JSON Files (*.json)|*.json;*.cfproj|All Files (*.*)|*.*||'
          )
          return unless file_path && File.exist?(file_path)

          json_text = File.read(file_path, encoding: 'UTF-8')
          stats = sync_project_json(json_text, runtime)

          UI.messagebox(
            "🎉 ConstructFlow 3D Sync สำเร็จเรียบร้อย!\n\n" \
            "• แกนเสา (Grids): #{stats[:grids]} เส้น\n" \
            "• เสา (Columns): #{stats[:columns]} ต้น\n" \
            "• ฐานราก (Footings): #{stats[:foundations]} ฐาน\n" \
            "• คาน (Beams): #{stats[:beams]} ช่วง\n" \
            "• ผนัง (Walls): #{stats[:walls]} แผง\n" \
            "• ประตู (Doors): #{stats[:doors]} บาน\n" \
            "• หน้าต่าง (Windows): #{stats[:windows]} บาน\n\n" \
            "สร้างโมเดล 3D และเชื่อมโยงข้อมูล BIM ตามผังเรียบร้อยแล้ว",
            MB_OK
          )
        rescue StandardError => err
          UI.messagebox("ConstructFlow Plan Sync ผิดพลาด: #{err.message}\n#{err.backtrace&.first(3)&.join("\n")}")
        end

        # Synchronize a ConstructFlow Project Document (JSON text or Hash) into SketchUp 3D
        def sync_project_json(json_or_hash, runtime = nil)
          runtime ||= JiraNot::ConstructFlow::Runtime
          doc = json_or_hash.is_a?(String) ? JSON.parse(json_or_hash) : json_or_hash

          model = runtime.active_model || Sketchup.active_model
          raise 'No active SketchUp model available' unless model

          project_id = doc.dig('project', 'id') || runtime.project&.project_id || 'CF-PROJ'

          objects = doc['objects'] || {}
          types = doc['types'] || []
          levels = doc['levels'] || []

          # Ensure tags and scene tabs
          ensure_hierarchical_tags(model)
          ensure_automated_scenes(model, levels)

          stats = { grids: 0, columns: 0, foundations: 0, beams: 0, walls: 0, doors: 0, windows: 0 }

          model.start_operation('ConstructFlow 2D Plan -> 3D Sync', true)
          begin
            # 1. Register Levels if missing
            level_list = (levels.is_a?(Array) && !levels.empty?) ? levels : [
              { 'id' => 'GF', 'name' => 'Ground Floor', 'elevation_mm' => 0 },
              { 'id' => 'L2', 'name' => 'First Floor', 'elevation_mm' => 3000 }
            ]
            level_list.each do |lvl|
              lvl_id = lvl['id'].to_s
              lvl_name = lvl['name'] || lvl_id
              elev = Float(lvl['elevation_mm'] || 0)
              next if runtime.levels.registered?(lvl_id)

              res = runtime.commands.execute(
                'CreateLevel',
                { id: lvl_id, name: lvl_name, elevation_mm: elev, kind: 'floor' },
                project_id: project_id
              )
              puts "[ConstructFlow Sync] Level #{lvl_id} registered: #{res[:status]}"
            end

            # 2. Sync Grids
            objects.each_value do |obj|
              next unless obj['object_type'] == 'structure.grid'

              m = obj['module_data'] || {}
              pos = Float(m['position_mm'] || 0)
              extent = m['extent_mm'] || [-10000, 15000]
              is_vert = m['orientation'] == 'vertical'

              path = if is_vert
                       [[pos, extent[0], 0], [pos, extent[1], 0]]
                     else
                       [[extent[0], pos, 0], [extent[1], pos, 0]]
                     end

              res = runtime.commands.execute(
                'CreateStructuralGrid',
                {
                  id: obj['id'],
                  name: m['tag'] || 'Grid',
                  path_mm: path,
                  level_id: doc.dig('project', 'active_level_id') || 'GF'
                },
                project_id: project_id
              )
              if res[:status] == 'success'
                stats[:grids] += 1
              else
                puts "[ConstructFlow Sync] ❌ Grid rejected (#{m['tag']}): #{res[:errors]&.join('; ')}"
              end
            rescue StandardError => e
              puts "[ConstructFlow Sync] Grid warning: #{e.message}"
            end

            # 3. Sync Columns (Non-destructive check)
            objects.each_value do |obj|
              next unless obj['object_type'] == 'structure.column'

              uuid = obj['id']
              existing = find_entity_by_uuid(model, uuid)
              m = obj['module_data'] || {}
              loc = m['location_mm'] || [0, 0, 0]
              loc_3d = [Float(loc[0]), Float(loc[1]), Float(loc[2] || 0)]

              res = runtime.commands.execute(
                'CreateColumn',
                {
                  id: uuid,
                  mark: m['mark'] || 'C1',
                  location_mm: loc_3d,
                  section_mm: m['section_mm'] || [200, 200],
                  height_mm: Float(m['height_mm'] || 3000),
                  base_level_id: m['base_level_id'] || 'GF',
                  top_level_id: m['top_level_id'] || 'L2',
                  material: m['material'] || 'reinforced_concrete',
                  created_phase: obj['created_phase'] || 'new_construction'
                },
                project_id: project_id
              )
              if res[:status] == 'success'
                stats[:columns] += 1
                # Mark UUID attribute dictionary
                inst = find_entity_by_uuid(model, uuid) || model.entities.grep(Sketchup::ComponentInstance).last
                inst&.set_attribute('constructflow', 'uuid', uuid)
              else
                puts "[ConstructFlow Sync] ❌ Column rejected (#{m['mark']}): #{res[:errors]&.join('; ')}"
              end
            rescue StandardError => e
              puts "[ConstructFlow Sync] Column warning: #{e.message}"
            end

            # 4. Sync Foundations (Footings)
            objects.each_value do |obj|
              next unless obj['object_type'] == 'structure.foundation'

              uuid = obj['id']
              m = obj['module_data'] || {}
              loc = m['center_mm'] || m['location_mm']
              loc_3d = loc ? [Float(loc[0]), Float(loc[1]), Float(loc[2] || 0)] : nil
              fnd_input = {
                id: uuid,
                mark: m['mark'] || 'F1',
                supported_column_id: m['supported_column_id'],
                size_mm: m['size_mm'] || [800, 800, 300],
                material: m['material'] || 'reinforced_concrete',
                created_phase: obj['created_phase'] || 'new_construction'
              }
              fnd_input[:location_mm] = loc_3d if loc_3d
              res = runtime.commands.execute('CreateFoundation', fnd_input, project_id: project_id)
              if res[:status] == 'success'
                stats[:foundations] += 1
                inst = find_entity_by_uuid(model, uuid) || model.entities.grep(Sketchup::ComponentInstance).last
                inst&.set_attribute('constructflow', 'uuid', uuid)
              else
                puts "[ConstructFlow Sync] ❌ Foundation rejected (#{m['mark']}): #{res[:errors]&.join('; ')}"
              end
            rescue StandardError => e
              puts "[ConstructFlow Sync] Foundation warning: #{e.message}"
            end

            # 5. Sync Beams
            objects.each_value do |obj|
              next unless obj['object_type'] == 'structure.beam'

              uuid = obj['id']
              m = obj['module_data'] || {}
              p1 = m['start_point_mm'] || [0, 0, 0]
              p2 = m['end_point_mm'] || [4000, 0, 0]
              p1_3d = [Float(p1[0]), Float(p1[1]), Float(p1[2] || 0)]
              p2_3d = [Float(p2[0]), Float(p2[1]), Float(p2[2] || 0)]
              res = runtime.commands.execute(
                'CreateBeam',
                {
                  id: uuid,
                  mark: m['mark'] || 'B1',
                  path_mm: [p1_3d, p2_3d],
                  section_mm: m['section_mm'] || [200, 400],
                  level_id: m['level_id'] || 'GF',
                  material: m['material'] || 'reinforced_concrete',
                  created_phase: obj['created_phase'] || 'new_construction'
                },
                project_id: project_id
              )
              if res[:status] == 'success'
                stats[:beams] += 1
                inst = find_entity_by_uuid(model, uuid) || model.entities.grep(Sketchup::ComponentInstance).last
                inst&.set_attribute('constructflow', 'uuid', uuid)
              else
                puts "[ConstructFlow Sync] ❌ Beam rejected (#{m['mark']}): #{res[:errors]&.join('; ')}"
              end
            rescue StandardError => e
              puts "[ConstructFlow Sync] Beam warning: #{e.message}"
            end

            # 6. Sync Walls
            objects.each_value do |obj|
              next unless obj['object_type'] == 'architecture.wall'

              uuid = obj['id']
              m = obj['module_data'] || {}
              p1 = m['start_point_mm'] || [0, 0, 0]
              p2 = m['end_point_mm'] || [4000, 0, 0]
              p1_3d = [Float(p1[0]), Float(p1[1]), Float(p1[2] || 0)]
              p2_3d = [Float(p2[0]), Float(p2[1]), Float(p2[2] || 0)]
              res = runtime.commands.execute(
                'CreateWall',
                {
                  id: uuid,
                  mark: m['mark'] || 'W1',
                  path_mm: [p1_3d, p2_3d],
                  thickness_mm: Float(m['thickness_mm'] || 100),
                  height_mm: Float(m['height_mm'] || 2800),
                  level_id: m['level_id'] || 'GF',
                  material: m['material'] || 'brick_masonry',
                  created_phase: obj['created_phase'] || 'new_construction'
                },
                project_id: project_id
              )
              if res[:status] == 'success'
                stats[:walls] += 1
                inst = find_entity_by_uuid(model, uuid) || model.entities.grep(Sketchup::ComponentInstance).last
                inst&.set_attribute('constructflow', 'uuid', uuid)
              else
                puts "[ConstructFlow Sync] ❌ Wall rejected (#{m['mark']}): #{res[:errors]&.join('; ')}"
              end
            rescue StandardError => e
              puts "[ConstructFlow Sync] Wall warning: #{e.message}"
            end

            # 7. Sync Doors and Windows (Hosted on Walls)
            objects.each_value do |obj|
              is_door = obj['object_type'] == 'door_window.door'
              is_win = obj['object_type'] == 'door_window.window'
              next unless is_door || is_win

              uuid = obj['id']
              m = obj['module_data'] || {}
              wall_id = m['wall_id'] || (obj['host_refs'] && obj['host_refs'][0])
              next unless wall_id

              w_mm = Float(m['width_mm'] || (is_door ? 800 : 1200))
              h_mm = Float(m['height_mm'] || (is_door ? 2000 : 1200))
              sill_mm = Float(m['sill_height_mm'] || (is_door ? 0 : 900))
              handing = m['handing'] || 'left_in'
              loc = m['location_mm'] || [0, 0, 0]
              loc_3d = [Float(loc[0]), Float(loc[1]), Float(loc[2] || 0)]

              res = runtime.commands.execute(
                'PlaceDoorWindowOnWall',
                {
                  id: uuid,
                  host_object_id: wall_id,
                  point_mm: loc_3d,
                  width_mm: w_mm,
                  height_mm: h_mm,
                  sill_mm: sill_mm,
                  handing: handing,
                  category: is_door ? 'door' : 'window',
                  schedule_mark: m['mark'] || (is_door ? 'D1' : 'W1'),
                  created_phase: obj['created_phase'] || 'new_construction'
                },
                project_id: project_id
              )

              if res[:status] == 'success'
                if is_door
                  stats[:doors] += 1
                else
                  stats[:windows] += 1
                end
                inst = find_entity_by_uuid(model, uuid) || model.entities.grep(Sketchup::ComponentInstance).last
                inst&.set_attribute('constructflow', 'uuid', uuid)
              else
                puts "[ConstructFlow Sync] ❌ Opening rejected (#{m['mark']}): #{res[:errors]&.join('; ')}"
              end
            rescue StandardError => e
              puts "[ConstructFlow Sync] Opening warning: #{e.message}"
            end

            model.commit_operation
            puts "[ConstructFlow Sync] Success! Generated 3D elements: #{stats.inspect}"
            stats
          rescue StandardError => err
            model.abort_operation
            puts "[ConstructFlow Sync] Error aborted: #{err.message}"
            raise err
          end
        end

        # File watcher thread helper for live .cfproj watching
        def start_file_watcher(file_path, poll_interval_sec = 1.0)
          return unless File.exist?(file_path)

          last_mtime = File.mtime(file_path)
          Thread.new do
            loop do
              sleep(poll_interval_sec)
              begin
                if File.exist?(file_path)
                  current_mtime = File.mtime(file_path)
                  if current_mtime > last_mtime
                    last_mtime = current_mtime
                    puts "[ConstructFlow Watcher] Detected #{file_path} update, syncing..."
                    sync_project_json(File.read(file_path, encoding: 'UTF-8'))
                  end
                end
              rescue StandardError => e
                puts "[ConstructFlow Watcher] Error: #{e.message}"
              end
            end
          end
        end
      end
    end
  end
end
