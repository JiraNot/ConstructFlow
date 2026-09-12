# frozen_string_literal: true

require_relative 'i18n'

module JiraNot
  module ConstructFlow
    module Core
      module Toolbar
        ICON_DIR = File.expand_path(File.join(__dir__, '..', 'icons')).freeze

        module_function

        def install(runtime)
          install_toolbar(runtime) if defined?(UI) && defined?(UI::Toolbar)
          install_menus(runtime) if defined?(UI) && UI.respond_to?(:menu)
        end

        def install_toolbar(runtime)
          tb = UI::Toolbar.new(I18n.t('toolbar.name'))

          # GROUP 1: Project Setup (ขั้นตอนที่ 1)
          add_btn(tb, 'inspector', 'tool.inspector') { runtime.show_inspector }
          add_btn(tb, 'level',     'tool.level')     { prompt_create_level(runtime) }
          add_btn(tb, 'phase',     'tool.phase')     { prompt_set_phase(runtime) }
          tb.add_separator

          # GROUP 2: Structure (ขั้นตอนที่ 2)
          add_btn(tb, 'foundation','tool.foundation'){ prompt_foundation(runtime) }
          add_btn(tb, 'column',    'tool.column')    { prompt_column_tool(runtime) }
          tb.add_separator

          # GROUP 3: Architecture (ขั้นตอนที่ 3)
          add_btn(tb, 'wall',       'tool.wall')       { prompt_wall_tool(runtime) }
          add_btn(tb, 'opening',    'tool.opening')    { prompt_opening_tool(runtime) }
          add_btn(tb, 'door_window','tool.door_window'){ prompt_door_window(runtime) }
          add_btn(tb, 'roof',       'tool.roof')       { prompt_roof(runtime) }
          add_btn(tb, 'gutter',     'tool.gutter')     { prompt_gutter(runtime) }
          tb.add_separator

          # GROUP 4: MEP Systems (ขั้นตอนที่ 4)
          add_btn(tb, 'manhole',   'tool.manhole')    { prompt_manhole_tool(runtime) }
          add_btn(tb, 'pipe',      'tool.pipe')       { prompt_pipe_route(runtime) }
          add_btn(tb, 'panelboard','tool.panelboard') { prompt_panelboard(runtime) }
          add_btn(tb, 'cable',     'tool.cable')      { prompt_cable_conduit(runtime) }
          tb.add_separator

          # GROUP 5: Interiors & Finishes (ขั้นตอนที่ 5)
          add_btn(tb, 'surface',   'tool.surface')    { prompt_surface(runtime) }
          add_btn(tb, 'cabinet',   'tool.cabinet')    { prompt_cabinet_tool(runtime) }
          add_btn(tb, 'wardrobe',  'tool.wardrobe')   { prompt_wardrobe(runtime) }
          tb.add_separator

          # GROUP 6: Library & Costing (ขั้นตอนที่ 6)
          add_btn(tb, 'asset',     'tool.asset')      { prompt_asset(runtime) }
          add_btn(tb, 'costing',   'tool.costing')    { show_costing_summary(runtime) }

          tb.restore
          tb
        end

        def install_menus(runtime)
          main_menu = runtime.respond_to?(:menu) && runtime.menu ? runtime.menu : UI.menu('Extensions').add_submenu(I18n.t('menu.main'))

          # Group 1: Setup
          setup_menu = main_menu.add_submenu(I18n.t('group.setup'))
          setup_menu.add_item(I18n.t('tool.inspector.label')) { runtime.show_inspector }
          setup_menu.add_item(I18n.t('tool.level.label'))     { prompt_create_level(runtime) }
          setup_menu.add_item(I18n.t('tool.phase.label'))     { prompt_set_phase(runtime) }

          # Group 2: Structure
          struct_menu = main_menu.add_submenu(I18n.t('group.structure'))
          struct_menu.add_item(I18n.t('tool.foundation.label')) { prompt_foundation(runtime) }
          struct_menu.add_item(I18n.t('tool.column.label'))     { prompt_column_tool(runtime) }

          # Group 3: Architecture
          arch_menu = main_menu.add_submenu(I18n.t('group.architecture'))
          arch_menu.add_item(I18n.t('tool.wall.label'))        { prompt_wall_tool(runtime) }
          arch_menu.add_item(I18n.t('tool.opening.label'))     { prompt_opening_tool(runtime) }
          arch_menu.add_item(I18n.t('tool.door_window.label')) { prompt_door_window(runtime) }
          arch_menu.add_item(I18n.t('tool.roof.label'))        { prompt_roof(runtime) }
          arch_menu.add_item(I18n.t('tool.gutter.label'))      { prompt_gutter(runtime) }

          # Group 4: MEP
          mep_menu = main_menu.add_submenu(I18n.t('group.mep'))
          mep_menu.add_item(I18n.t('tool.manhole.label'))    { prompt_manhole_tool(runtime) }
          mep_menu.add_item(I18n.t('tool.pipe.label'))       { prompt_pipe_route(runtime) }
          mep_menu.add_item(I18n.t('tool.panelboard.label')) { prompt_panelboard(runtime) }
          mep_menu.add_item(I18n.t('tool.cable.label'))      { prompt_cable_conduit(runtime) }

          # Group 5: Interiors
          int_menu = main_menu.add_submenu(I18n.t('group.interior'))
          int_menu.add_item(I18n.t('tool.surface.label'))  { prompt_surface(runtime) }
          int_menu.add_item(I18n.t('tool.cabinet.label'))  { prompt_cabinet_tool(runtime) }
          int_menu.add_item(I18n.t('tool.wardrobe.label')) { prompt_wardrobe(runtime) }

          # Group 6: Library & Costing
          cost_menu = main_menu.add_submenu(I18n.t('group.costing'))
          cost_menu.add_item(I18n.t('tool.asset.label'))   { prompt_asset(runtime) }
          cost_menu.add_item(I18n.t('tool.costing.label')) { show_costing_summary(runtime) }
        end

        def add_btn(toolbar, icon_name, i18n_prefix, &block)
          cmd = UI::Command.new(I18n.t("#{i18n_prefix}.label"), &block)
          cmd.tooltip = I18n.t("#{i18n_prefix}.tooltip")
          cmd.status_bar_text = I18n.t("#{i18n_prefix}.status")
          small = File.join(ICON_DIR, "#{icon_name}.png")
          large = File.join(ICON_DIR, "#{icon_name}@2x.png")
          cmd.small_icon = small if File.exist?(small)
          cmd.large_icon = large if File.exist?(large)
          toolbar.add_item(cmd)
          cmd
        end

        # --- Interactive Action Prompts ---

        def prompt_create_level(runtime)
          values = UI.inputbox(
            ['ชื่อระดับชั้น (Level Name)', 'ระดับความสูง mm (Elevation)', 'ประเภท (floor/roof/ceiling)'],
            ['First Floor', '3000', 'floor'],
            'ConstructFlow: กำหนดระดับชั้นอาคาร'
          )
          return unless values

          id = "level_#{values[0].to_s.downcase.gsub(/[^a-z0-9]/, '_')}_#{Time.now.to_i}"
          runtime.levels.register(
            id: id,
            name: values[0].to_s,
            elevation_mm: Float(values[1]),
            kind: values[2].to_s,
            source_state: 'confirmed'
          )
          UI.messagebox("สร้างระดับชั้น #{values[0]} (+#{values[1]} mm) เรียบร้อยแล้ว")
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_set_phase(runtime)
          current = runtime.project&.working_phase || 'new_construction'
          values = UI.inputbox(
            ['เลือกระยะเวลาก่อสร้าง (existing / demolition / new_construction)'],
            [current],
            'ConstructFlow: กำหนดเฟสการทำงาน'
          )
          return unless values

          phase = values[0].to_s.strip
          if %w[existing demolition new_construction].include?(phase)
            runtime.project.set_working_phase(phase)
            UI.messagebox("สลับเฟสการทำงานปัจจุบันเป็น: #{phase}")
          else
            UI.messagebox('กรุณาระบุ existing, demolition, หรือ new_construction')
          end
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_foundation(runtime)
          column = runtime.active_model.selection
                          .filter_map { |e| runtime.smart_objects.fetch(e) }
                          .find { |o| o.type == 'structure.column' }
          if column
            values = UI.inputbox(
              ['ชนิดฐานราก', 'ความกว้าง W mm', 'ความยาว L mm', 'ความหนา D mm'],
              ['spread_footing', '1000', '1000', '400'],
              'ConstructFlow: สร้างฐานรากใต้เสา'
            )
            return unless values

            result = runtime.commands.execute(
              'GenerateFoundation',
              {
                column_object_id: column.id,
                foundation_type: values[0].to_s,
                size_mm: [Float(values[1]), Float(values[2]), Float(values[3])]
              },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:status] == 'success' ? 'สร้างฐานรากเรียบร้อย' : result[:errors].join("\n"))
          else
            values = UI.inputbox(
              ['ชนิดฐานราก', 'ความกว้าง W mm', 'ความยาว L mm', 'ความหนา D mm', 'พิกัด X mm', 'พิกัด Y mm', 'ระดับ Z mm'],
              ['spread_footing', '1000', '1000', '400', '0', '0', '0'],
              'ConstructFlow: สร้างฐานราก (ระบุพิกัด)'
            )
            return unless values

            result = runtime.commands.execute(
              'CreateFoundation',
              {
                foundation_type: values[0].to_s,
                size_mm: [Float(values[1]), Float(values[2]), Float(values[3])],
                location_mm: [Float(values[4]), Float(values[5]), Float(values[6])]
              },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:status] == 'success' ? 'สร้างฐานรากเรียบร้อย' : result[:errors].join("\n"))
          end
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_column_tool(runtime)
          values = UI.inputbox(
            ['ความกว้างหน้าตัด (mm)', 'ความลึกหน้าตัด (mm)', 'ความสูงเสา (mm)', 'Base Level ID (เว้นว่างได้)', 'Top Level ID (เว้นว่างได้)'],
            ['200', '200', '2800', '', ''],
            'ConstructFlow: วาดเสาโครงสร้าง'
          )
          return unless values

          runtime.active_model.select_tool(
            Structure::Tools::ColumnTool.new(
              runtime: runtime,
              section_mm: [Float(values[0]), Float(values[1])],
              explicit_height_mm: Float(values[2]),
              base_level_id: values[3].to_s,
              top_level_id: values[4].to_s
            )
          )
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_wall_tool(runtime)
          values = UI.inputbox(
            ['ความหนาผนัง (mm)', 'ความสูงผนัง (mm)', 'Base Level ID (เว้นว่างได้)'],
            ['100', '2800', ''],
            'ConstructFlow: วาดผนังอัจฉริยะ'
          )
          return unless values

          runtime.active_model.select_tool(
            Architecture::Tools::WallTool.new(
              runtime: runtime,
              thickness_mm: Float(values[0]),
              height_mm: Float(values[1]),
              level_id: values[2].to_s
            )
          )
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_opening_tool(runtime)
          values = UI.inputbox(
            ['ความกว้างช่องเปิด (mm)', 'ความสูงช่องเปิด (mm)', 'ระยะยกขอบพื้น Sill (mm)'],
            ['900', '2050', '0'],
            'ConstructFlow: เจาะช่องเปิดผนัง'
          )
          return unless values

          runtime.active_model.select_tool(
            Opening::Tools::OpeningTool.new(
              runtime: runtime,
              width_mm: Float(values[0]),
              height_mm: Float(values[1]),
              sill_mm: Float(values[2])
            )
          )
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_door_window(runtime)
          opening = runtime.active_model.selection
                           .filter_map { |e| runtime.smart_objects.fetch(e) }
                           .find { |o| o.type == 'opening.aperture' }
          unless opening
            UI.messagebox('กรุณาคลิกเลือกวัตถุช่องเปิด (Opening) บนผนังก่อน เพื่อติดตั้งประตูหรือหน้าต่าง')
            return
          end

          values = UI.inputbox(
            ['หมวดหมู่ (door หรือ window)', 'การเปิด (swing / sliding / fixed)', 'วัสดุกรอบเฟรม', 'รูปแบบบาน'],
            ['door', 'swing', 'aluminium', 'glazed'],
            'ConstructFlow: ติดตั้งประตู/หน้าต่าง'
          )
          return unless values

          result = runtime.commands.execute(
            'CreateDoorWindow',
            {
              opening_object_id: opening.id,
              category: values[0].to_s,
              operation: values[1].to_s,
              frame_material: values[2].to_s,
              panel_style: values[3].to_s
            },
            project_id: runtime.project.project_id
          )
          UI.messagebox(result[:status] == 'success' ? 'ติดตั้งประตู/หน้าต่างสำเร็จ' : result[:errors].join("\n"))
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_roof(runtime)
          face = runtime.active_model.selection.find { |e| e.is_a?(Sketchup::Face) }
          unless face
            UI.messagebox('กรุณาเลือกพื้นผิว (Face) ที่ต้องการสร้างหลังคาก่อน')
            return
          end

          values = UI.inputbox(
            ['วัสดุมุงหลังคา (metal_sheet / tile / shingle)', 'ความลาดชัน Slope (%)', 'ทิศทาง Slope X', 'ทิศทาง Slope Y'],
            ['metal_sheet', '10', '0', '1'],
            'ConstructFlow: สร้างระบบหลังคา'
          )
          return unless values

          boundary = face.outer_loop.vertices.map { |v| Core::Units.point_to_mm(v.position) }
          result = runtime.commands.execute(
            'GenerateRoof',
            {
              boundary_mm: boundary,
              covering_system: values[0].to_s,
              slope_percent: Float(values[1]),
              slope_direction_xy: [Float(values[2]), Float(values[3])]
            },
            project_id: runtime.project.project_id
          )
          UI.messagebox(result[:status] == 'success' ? 'สร้างระบบหลังคาสำเร็จ' : result[:errors].join("\n"))
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_gutter(runtime)
          roof = runtime.active_model.selection
                        .filter_map { |e| runtime.smart_objects.fetch(e) }
                        .find { |o| o.type == 'roof.system' }
          unless roof
            UI.messagebox('กรุณาเลือกวัตถุหลังคา (Roof) ก่อนเพื่อติดตั้งรางน้ำฝน')
            return
          end

          values = UI.inputbox(
            ['หมายเลขขอบชายคา (Edge index 0..N)', 'ตำแหน่งจุดระบายน้ำ Outlet ratio (0.0-1.0)'],
            ['0', '1.0'],
            'ConstructFlow: ติดตั้งรางน้ำฝน'
          )
          return unless values

          result = runtime.commands.execute(
            'AddGutter',
            { roof_object_id: roof.id, edge_index: Integer(values[0]), outlet_ratio: Float(values[1]) },
            project_id: runtime.project.project_id
          )
          UI.messagebox(result[:status] == 'success' ? 'ติดตั้งรางน้ำฝนสำเร็จ' : result[:errors].join("\n"))
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_manhole_tool(runtime)
          values = UI.inputbox(
            ['ขนาดบ่อพัก (mm)', 'ระดับฝา Cover level mm (เว้นว่างได้)', 'ระดับก้นท่อเข้า Invert in mm (เว้นว่างได้)', 'ระดับก้นท่อออก Invert out mm (เว้นว่างได้)'],
            ['600', '', '', ''],
            'ConstructFlow: วางบ่อพักน้ำทิ้ง'
          )
          return unless values

          runtime.active_model.select_tool(
            Drainage::Tools::ManholeTool.new(
              runtime: runtime,
              size_mm: [Float(values[0]), Float(values[0])],
              cover_level_mm: values[1].to_s.empty? ? nil : Float(values[1]),
              invert_in_mm: values[2].to_s.empty? ? nil : Float(values[2]),
              invert_out_mm: values[3].to_s.empty? ? nil : Float(values[3])
            )
          )
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_pipe_route(runtime)
          manholes = runtime.active_model.selection
                            .filter_map { |e| runtime.smart_objects.fetch(e) }
                            .select { |o| o.type == 'drainage.manhole' }
          if manholes.size == 2
            upstream, downstream = manholes
            start_id = runtime.connectors.connectors_for(upstream.id).find { |item| item['role'] == 'outlet' }&.dig('id')
            end_id = runtime.connectors.connectors_for(downstream.id).find { |item| item['role'] == 'inlet' }&.dig('id')
            result = runtime.commands.execute(
              'CreatePipeRoute',
              { start_connector_id: start_id, end_connector_id: end_id, system: 'waste' },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:status] == 'success' ? 'เชื่อมต่อท่อระบายน้ำสำเร็จ' : result[:errors].join("\n"))
          else
            UI.messagebox('กรุณาเลือกบ่อพักน้ำทิ้ง (Manhole) 2 บ่อในแบบ (ต้นทาง และ ปลายทาง) เพื่อเชื่อมต่อท่อ')
          end
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_panelboard(runtime)
          values = UI.inputbox(
            ['รหัส/ชื่อตู้ไฟฟ้า', 'ระบบเฟส (1P2W หรือ 3P4W)', 'แรงดันไฟฟ้า V', 'เมนเบรกเกอร์ (A)', 'พิกัดบัสบาร์ (A)', 'จำนวนวงจรสูงสุด'],
            ['DB-1', '1P2W', '230', '50', '100', '24'],
            'ConstructFlow: ติดตั้งตู้ควบคุมไฟฟ้า'
          )
          return unless values

          result = runtime.commands.execute(
            'CreatePanelboard',
            {
              id: "panel_#{values[0].to_s.downcase.gsub(/[^a-z0-9]/, '_')}",
              name: values[0].to_s,
              phase_config: values[1].to_s,
              voltage_v: Float(values[2]),
              main_breaker_a: Float(values[3]),
              bus_rating_a: Float(values[4]),
              max_circuits: Integer(values[5])
            },
            project_id: runtime.project.project_id
          )
          UI.messagebox("สร้างตู้ควบคุมไฟฟ้า #{values[0]} เรียบร้อยแล้ว")
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_cable_conduit(runtime)
          values = UI.inputbox(
            ['จุดเริ่มต้น X,Y,Z (mm)', 'จุดสิ้นสุด X,Y,Z (mm)', 'กลยุทธ์ (ceiling_first / floor_first)', 'ระดับฝ้า Ceiling Z (mm)'],
            ['0,0,1000', '3000,0,1000', 'ceiling_first', '2600'],
            'ConstructFlow: เดินท่อร้อยสายไฟฟ้า'
          )
          return unless values

          start_pt = values[0].split(',').map { |v| Float(v.strip) }
          end_pt = values[1].split(',').map { |v| Float(v.strip) }
          runtime.commands.execute(
            'CreateConduitRoute',
            {
              start_point: start_pt,
              end_point: end_pt,
              strategy: values[2].to_s,
              ceiling_z_mm: Float(values[3])
            },
            project_id: runtime.project.project_id
          )
          UI.messagebox('สร้างแนวท่อร้อยสายไฟฟ้าสำเร็จ')
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_surface(runtime)
          face = runtime.active_model.selection.find { |e| e.is_a?(Sketchup::Face) }
          unless face
            UI.messagebox('กรุณาเลือกพื้นผิว (Face) ที่ต้องการสร้างผิวพื้นก่อน')
            return
          end

          values = UI.inputbox(['ชนิดผิวพื้น (paver / tile / timber)'], ['paver'], 'ConstructFlow: สร้างผิวพื้น')
          return unless values

          outer = face.outer_loop.vertices.map { |v| Core::Units.point_to_mm(v.position) }
          holes = face.loops.reject(&:outer?).map { |loop| loop.vertices.map { |v| Core::Units.point_to_mm(v.position) } }
          result = runtime.commands.execute(
            'CreateSurfaceBoundary',
            { outer_boundary_mm: outer, holes_mm: holes, surface_type: values[0].to_s },
            project_id: runtime.project.project_id
          )
          UI.messagebox(result[:status] == 'success' ? 'สร้างผิวพื้นสำเร็จ' : result[:errors].join("\n"))
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_cabinet_tool(runtime)
          values = UI.inputbox(
            ['ความกว้างรวม (mm)', 'ความสูงเคาน์เตอร์ (mm)', 'ความลึกตู้ (mm)', 'จำนวนช่องโมดูล', 'รหัสวัสดุโครงตู้'],
            ['1800', '850', '600', '3', 'board.hmr.18'],
            'ConstructFlow: วางแนวเคาน์เตอร์บิวท์อิน'
          )
          return unless values

          runtime.active_model.select_tool(
            Interior::Tools::CabinetRunTool.new(
              runtime: runtime,
              params: {
                width_mm: Float(values[0]),
                height_mm: Float(values[1]),
                depth_mm: Float(values[2]),
                module_count: Integer(values[3]),
                carcass_material_id: values[4].to_s
              }
            )
          )
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_wardrobe(runtime)
          values = UI.inputbox(
            ['ความกว้างตู้ (mm)', 'ความสูงตู้ (mm)', 'ความลึกตู้ (mm)', 'ชนิดหน้าบาน (hinged / sliding)'],
            ['1800', '2400', '600', 'hinged'],
            'ConstructFlow: สร้างตู้เสื้อผ้าบิวท์อิน'
          )
          return unless values

          result = runtime.commands.execute(
            'CreateWardrobe',
            {
              width_mm: Float(values[0]),
              height_mm: Float(values[1]),
              depth_mm: Float(values[2]),
              door_type: values[3].to_s
            },
            project_id: runtime.project.project_id
          )
          UI.messagebox(result[:status] == 'success' ? 'สร้างตู้เสื้อผ้าสำเร็จ' : result[:errors].join("\n"))
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def prompt_asset(runtime)
          values = UI.inputbox(
            ['รหัสครุภัณฑ์ Asset ID', 'มุมหมุน Rotation (องศา)'],
            ['chair.office.mesh', '0'],
            'ConstructFlow: วางครุภัณฑ์สำเร็จรูป'
          )
          return unless values

          result = runtime.commands.execute(
            'PlaceCatalogAsset',
            {
              asset_id: values[0].to_s.strip,
              location_mm: [0, 0, 0],
              rotation_deg: Float(values[1])
            },
            project_id: runtime.project.project_id
          )
          UI.messagebox(result[:status] == 'success' ? 'วางครุภัณฑ์สำเร็จ' : result[:errors].join("\n"))
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end

        def show_costing_summary(runtime)
          obj_count = runtime.smart_objects.size rescue 0
          lvl_count = runtime.levels.size rescue 0
          lines = [
            '=== ConstructFlow: สรุปปริมาณงานและราคา BOQ ===',
            "รหัสโครงการ: #{runtime.project&.project_id || '-'}",
            "ระยะเวลาก่อสร้าง (Phase): #{runtime.project&.working_phase || 'new_construction'}",
            "จำนวนชั้นอาคาร: #{lvl_count}",
            "จำนวนชิ้นส่วนจำลอง (Smart Objects): #{obj_count}",
            '',
            'หมวดหมู่งานที่พร้อมประมาณราคา:',
            ' [✓] งานโครงสร้าง (ฐานราก, เสา คสล.)',
            ' [✓] งานสถาปัตยกรรม (ผนัง, ประตู-หน้าต่าง, หลังคา)',
            ' [✓] งานระบบ MEP (สุขาภิบาล, ไฟฟ้ากำลัง)',
            ' [✓] งานภายในและตกแต่ง (ตู้บิวท์อิน, ตู้เสื้อผ้า)',
            ' [✓] งานครุภัณฑ์และเฟอร์นิเจอร์',
            '',
            'พร้อมสำหรับการจัดทำบัญชีแสดงรายการวัสดุและราคา (BOQ)'
          ]
          UI.messagebox(lines.join("\n"))
        rescue StandardError => e
          UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
        end
      end
    end
  end
end
