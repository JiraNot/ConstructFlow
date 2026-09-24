# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # SketchUp menu plumbing extracted from Runtime so main.rb stays a thin
      # composition root. Everything here is UI-only; no command logic.
      module UiEntry
        module_function

        def install(runtime)
          menu = UI.menu('Extensions').add_submenu('ConstructFlow')
          runtime.instance_variable_set(:@menu, menu)
          define_menu_items(runtime, menu)
        end

        def define_menu_items(runtime, menu)
          menu.add_item('Foundation Inspector') { runtime.show_inspector }
          menu.add_item('Edit Project') { edit_project(runtime) }
          menu.add_item('Create Level') { create_level(runtime) }
          menu.add_item('Edit Level') { edit_level(runtime) }
          menu.add_item('Show Levels') { show_levels(runtime) }
          Toolbar.install(runtime)
        end

        def edit_project(runtime)
          values = UI.inputbox(
            ['Project name', 'Project code'],
            [runtime.project.project_name, runtime.project.project_code.to_s],
            'ConstructFlow Edit Project'
          )
          return unless values

          result = runtime.commands.execute(
            'UpdateProjectMetadata',
            { name: values[0], code: values[1] },
            project_id: runtime.project.project_id
          )
          if result[:status] == 'success'
            UI.messagebox("Project #{values[0]} updated.")
          else
            UI.messagebox(Array(result[:errors]).join("\n"))
          end
        rescue ArgumentError => error
          UI.messagebox("ConstructFlow Project error: #{error.message}")
        end

        def create_level(runtime)
          values = UI.inputbox(
            ['Level ID', 'Level name', 'Elevation (mm)', 'Kind'],
            ['', '', '0', 'FFL'],
            'ConstructFlow Create Level'
          )
          return unless values

          result = runtime.commands.execute(
            'CreateLevel',
            { id: values[0].to_s.strip, name: values[1].to_s.strip,
              elevation_mm: Float(values[2]), kind: values[3].to_s.strip },
            project_id: runtime.project.project_id
          )
          if result[:status] == 'success'
            UI.messagebox("Level #{values[0]} created.")
          else
            UI.messagebox(Array(result[:errors]).join("\n"))
          end
        rescue ArgumentError => error
          UI.messagebox("ConstructFlow Level error: #{error.message}")
        end

        def edit_level(runtime)
          values = UI.inputbox(
            ['Level ID', 'Level name', 'Elevation (mm)', 'Kind'],
            ['', '', '0', 'FFL'],
            'ConstructFlow Edit Level'
          )
          return unless values

          result = runtime.commands.execute(
            'ModifyLevel',
            { id: values[0].to_s.strip, name: values[1].to_s.strip,
              elevation_mm: Float(values[2]), kind: values[3].to_s.strip },
            project_id: runtime.project.project_id
          )
          if result[:status] == 'success'
            UI.messagebox("Level #{values[0]} updated.")
          else
            UI.messagebox(Array(result[:errors]).join("\n"))
          end
        rescue ArgumentError => error
          UI.messagebox("ConstructFlow Level error: #{error.message}")
        end

        def show_levels(runtime)
          levels = runtime.levels.each.map do |level|
            elevation = level.elevation_mm.nil? ? 'unknown elevation' : "#{level.elevation_mm} mm"
            "#{level.id} — #{level.name} — #{elevation}"
          end
          UI.messagebox(levels.empty? ? 'No ConstructFlow levels defined.' : levels.join("\n"))
        end

        def show_inspector(runtime)
          recent = runtime.diagnostics.recent(5).map { |entry| "[#{entry.severity}] #{entry.code}: #{entry.message}" }
          level_names = runtime.levels ? runtime.levels.map { |l| "  • #{l.name} (#{l.elevation_mm || 0} mm)" } : []
          message = [
            'ConstructFlow - ตรวจสอบสถานะโครงการ',
            "รหัสโครงการ: #{runtime.project&.project_id || '-'}",
            "ระยะเวลาก่อสร้าง (Phase): #{runtime.project&.working_phase || '-'}",
            "โมดูลที่ติดตั้ง: #{runtime.modules.size}",
            "ความสามารถระบบ: #{runtime.capabilities.size}",
            "ระดับชั้นอาคาร (Levels): #{runtime.levels&.size || 0}",
            *level_names,
            "วัตถุอัจฉริยะ (Smart Objects): #{runtime.smart_objects&.size || 0}",
            "จุดเชื่อมต่อ (Connectors): #{runtime.connectors&.connector_count || 0}",
            "เส้นทางเชื่อมต่อ (Connections): #{runtime.connectors&.connection_count || 0}",
            '',
            'บันทึกการทำงานล่าสุด:',
            *(recent.empty? ? ['(ไม่มีบันทึก)'] : recent)
          ].join("\n")
          UI.messagebox(message, MB_OK)
        end
      end
    end
  end
end
