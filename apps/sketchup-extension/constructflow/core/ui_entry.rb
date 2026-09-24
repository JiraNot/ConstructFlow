# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Single SketchUp "ConstructFlow" menu for the whole extension.
      # Domain registrations attach their submenus into THIS menu via
      # UiEntry.install_domain_menu instead of creating parallel
      # "ConstructFlow" menus, which used to duplicate the whole tree on boot.
      module UiEntry
        module_function

        # Entry point called by Runtime#install_ui_entry (during boot!).
        # Creates the ONE ConstructFlow menu, the quick-access items and the
        # toolbar. Domain registrations then use install_domain_menu to
        # attach into the same menu.
        def install(runtime)
          menu = UI.menu('Extensions').add_submenu('ConstructFlow')
          runtime.instance_variable_set(:@menu, menu)
          define_menu_items(runtime, menu)
          Toolbar.install(runtime, menu)
        end

        # Single place for domain submenus. Every registration that used to
        # call `runtime.menu.add_submenu(label)` now goes through here, so
        # all domain entries live under the one ConstructFlow menu.
        def install_domain_menu(runtime, label)
          menu = runtime.instance_variable_get(:@menu)
          return nil unless menu

          menu.add_submenu(label)
        end

        def define_menu_items(runtime, menu)
          menu.add_item('🏗️ เปิดแผง ConstructFlow\tCF') { HtmlDialogManager.open_panel(runtime) }
          menu.add_item('🔍 ตรวจสอบสถานะโครงการ\tIN') { show_inspector(runtime) }
          menu.add_separator

          menu.add_item('📋 ตั้งค่าโครงการ') { edit_project(runtime) }
          menu.add_item('📐 สร้างระดับชั้น (Level)') { create_level(runtime) }
          menu.add_item('📏 แก้ไขระดับชั้น (Level)') { edit_level(runtime) }
          menu.add_item('🗂 แสดงระดับชั้นทั้งหมด') { show_levels(runtime) }
          menu.add_item('🏠 สร้างโมเดลตัวอย่าง .SKP') { generate_real_project }
        end

        def generate_real_project
          require_relative '../real_project_generator'
          JiraNot::ConstructFlow::RealProjectGenerator.generate_and_save!
          UI.messagebox('ConstructFlow: สร้างโมเดลสถาปัตย์สมบูรณ์และบันทึกไฟล์ .SKP สำเร็จเรียบร้อยบน Desktop!')
        rescue StandardError => e
          UI.messagebox("ConstructFlow: สร้างโมเดลตัวอย่างล้มเหลว — #{e.class}: #{e.message}")
        end

        def edit_project(runtime)
          values = UI.inputbox(
            ['ชื่อโครงการ', 'รหัสโครงการ'],
            [runtime.project.project_name, runtime.project.project_code.to_s],
            'ConstructFlow ตั้งค่าโครงการ'
          )
          return unless values

          result = runtime.commands.execute(
            'UpdateProjectMetadata',
            { name: values[0], code: values[1] },
            project_id: runtime.project.project_id
          )
          report_result(result, "โครงการ #{values[0]} ถูกบันทึกแล้ว")
        rescue ArgumentError => e
          UI.messagebox("ConstructFlow ผิดพลาด: #{e.message}")
        end

        def create_level(runtime)
          values = UI.inputbox(
            ['รหัสระดับชั้น', 'ชื่อระดับชั้น', 'ระดับความสูง (มม.)', 'ชนิด (FFL/SL)'],
            ['', '', '0', 'FFL'],
            'ConstructFlow สร้างระดับชั้น'
          )
          return unless values

          result = runtime.commands.execute(
            'CreateLevel',
            { id: values[0].to_s.strip, name: values[1].to_s.strip,
              elevation_mm: Float(values[2]), kind: values[3].to_s.strip },
            project_id: runtime.project.project_id
          )
          report_result(result, "ระดับชั้น #{values[0]} ถูกสร้างแล้ว")
        rescue ArgumentError => e
          UI.messagebox("ConstructFlow ผิดพลาด: #{e.message}")
        end

        def edit_level(runtime)
          values = UI.inputbox(
            ['รหัสระดับชั้น', 'ชื่อระดับชั้น', 'ระดับความสูง (มม.)', 'ชนิด (FFL/SL)'],
            ['', '', '0', 'FFL'],
            'ConstructFlow แก้ไขระดับชั้น'
          )
          return unless values

          result = runtime.commands.execute(
            'ModifyLevel',
            { id: values[0].to_s.strip, name: values[1].to_s.strip,
              elevation_mm: Float(values[2]), kind: values[3].to_s.strip },
            project_id: runtime.project.project_id
          )
          report_result(result, "ระดับชั้น #{values[0]} ถูกแก้ไขแล้ว")
        rescue ArgumentError => e
          UI.messagebox("ConstructFlow ผิดพลาด: #{e.message}")
        end

        def show_levels(runtime)
          levels = runtime.levels.each.map do |level|
            elevation = level.elevation_mm.nil? ? 'unknown elevation' : "#{level.elevation_mm} mm"
            "#{level.id} — #{level.name} — #{elevation}"
          end
          UI.messagebox(levels.empty? ? 'ยังไม่มีระดับชั้นในโครงการ' : levels.join("\n"))
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

        def report_result(result, success_message)
          if result[:status] == 'success'
            UI.messagebox(success_message)
          else
            UI.messagebox(Array(result[:errors]).join("\n"))
          end
        end
      end
    end
  end
end
