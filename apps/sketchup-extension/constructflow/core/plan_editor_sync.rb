# frozen_string_literal: true

require 'json'

module JiraNot
  module ConstructFlow
    module Core
      module PlanEditorSync
        module_function

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

          stats = { grids: 0, columns: 0, foundations: 0, beams: 0, walls: 0, doors: 0, windows: 0 }

          model.start_operation('ConstructFlow 2D Plan -> 3D Sync', true)
          begin
            # 1. Register Levels if missing
            levels.each do |lvl|
              lvl_id = lvl['id']
              lvl_name = lvl['name'] || lvl_id
              elev = Float(lvl['elevation_mm'] || 0)
              next if runtime.levels.find(lvl_id) rescue false

              runtime.commands.execute(
                'CreateLevel',
                { id: lvl_id, name: lvl_name, elevation_mm: elev, kind: 'floor' },
                project_id: project_id
              ) rescue nil
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

              runtime.commands.execute(
                'CreateStructuralGrid',
                {
                  id: obj['id'],
                  name: m['tag'] || 'Grid',
                  path_mm: path,
                  level_id: doc.dig('project', 'active_level_id') || 'GF'
                },
                project_id: project_id
              )
              stats[:grids] += 1
            rescue StandardError => e
              puts "[ConstructFlow Sync] Grid warning: #{e.message}"
            end

            # 3. Sync Columns
            objects.each_value do |obj|
              next unless obj['object_type'] == 'structure.column'

              m = obj['module_data'] || {}
              res = runtime.commands.execute(
                'CreateColumn',
                {
                  id: obj['id'],
                  mark: m['mark'] || 'C1',
                  location_mm: m['location_mm'] || [0, 0, 0],
                  section_mm: m['section_mm'] || [200, 200],
                  height_mm: Float(m['height_mm'] || 3000),
                  base_level_id: m['base_level_id'] || 'GF',
                  top_level_id: m['top_level_id'] || 'L2',
                  material: m['material'] || 'reinforced_concrete',
                  created_phase: obj['created_phase'] || 'new_construction'
                },
                project_id: project_id
              )
              stats[:columns] += 1 if res[:status] == 'success'
            rescue StandardError => e
              puts "[ConstructFlow Sync] Column warning: #{e.message}"
            end

            # 4. Sync Foundations (Footings)
            objects.each_value do |obj|
              next unless obj['object_type'] == 'structure.foundation'

              m = obj['module_data'] || {}
              res = runtime.commands.execute(
                'CreateFoundation',
                {
                  id: obj['id'],
                  mark: m['mark'] || 'F1',
                  supported_column_id: m['supported_column_id'],
                  size_mm: m['size_mm'] || [800, 800, 300],
                  material: m['material'] || 'reinforced_concrete',
                  created_phase: obj['created_phase'] || 'new_construction'
                },
                project_id: project_id
              )
              stats[:foundations] += 1 if res[:status] == 'success'
            rescue StandardError => e
              puts "[ConstructFlow Sync] Foundation warning: #{e.message}"
            end

            # 5. Sync Beams
            objects.each_value do |obj|
              next unless obj['object_type'] == 'structure.beam'

              m = obj['module_data'] || {}
              p1 = m['start_point_mm'] || [0, 0, 0]
              p2 = m['end_point_mm'] || [4000, 0, 0]
              res = runtime.commands.execute(
                'CreateBeam',
                {
                  id: obj['id'],
                  mark: m['mark'] || 'B1',
                  path_mm: [p1, p2],
                  section_mm: m['section_mm'] || [200, 400],
                  level_id: m['level_id'] || 'GF',
                  material: m['material'] || 'reinforced_concrete',
                  created_phase: obj['created_phase'] || 'new_construction'
                },
                project_id: project_id
              )
              stats[:beams] += 1 if res[:status] == 'success'
            rescue StandardError => e
              puts "[ConstructFlow Sync] Beam warning: #{e.message}"
            end

            # 6. Sync Walls
            objects.each_value do |obj|
              next unless obj['object_type'] == 'architecture.wall'

              m = obj['module_data'] || {}
              p1 = m['start_point_mm'] || [0, 0, 0]
              p2 = m['end_point_mm'] || [4000, 0, 0]
              res = runtime.commands.execute(
                'CreateWall',
                {
                  id: obj['id'],
                  mark: m['mark'] || 'W1',
                  path_mm: [p1, p2],
                  thickness_mm: Float(m['thickness_mm'] || 100),
                  height_mm: Float(m['height_mm'] || 2800),
                  level_id: m['level_id'] || 'GF',
                  material: m['material'] || 'brick_masonry',
                  created_phase: obj['created_phase'] || 'new_construction'
                },
                project_id: project_id
              )
              stats[:walls] += 1 if res[:status] == 'success'
            rescue StandardError => e
              puts "[ConstructFlow Sync] Wall warning: #{e.message}"
            end

            # 7. Sync Doors and Windows (Hosted on Walls)
            objects.each_value do |obj|
              is_door = obj['object_type'] == 'door_window.door'
              is_win = obj['object_type'] == 'door_window.window'
              next unless is_door || is_win

              m = obj['module_data'] || {}
              wall_id = m['wall_id'] || obj.dig('host_refs', 0)
              next unless wall_id

              w_mm = Float(m['width_mm'] || (is_door ? 800 : 1200))
              h_mm = Float(m['height_mm'] || (is_door ? 2000 : 1200))
              sill_mm = Float(m['sill_height_mm'] || 0)
              handing = m['handing'] || 'left_in'
              loc = m['location_mm'] || [0, 0, 0]
              loc_3d = [Float(loc[0]), Float(loc[1]), Float(loc[2] || 0)]

              res = runtime.commands.execute(
                'PlaceDoorWindowOnWall',
                {
                  id: obj['id'],
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
      end
    end
  end
end
