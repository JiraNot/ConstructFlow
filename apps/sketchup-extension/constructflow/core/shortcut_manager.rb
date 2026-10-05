# frozen_string_literal: true

require_relative 'html_dialog'
require_relative '../modules/architecture/tools/wall_tool'
require_relative '../modules/architecture/tools/floor_tool'
require_relative '../modules/architecture/tools/ceiling_tool'
require_relative '../modules/structure/tools/column_tool'
require_relative '../modules/structure/tools/beam_tool'
require_relative '../modules/structure/tools/grid_tool'
require_relative '../modules/structure/tools/foundation_tool'
require_relative '../modules/door_window/tools/door_window_tool'
require_relative '../modules/opening/tools/opening_tool'
require_relative '../modules/electrical/tools/conduit_tool'
require_relative '../modules/drainage/tools/pipe_tool'
require_relative '../modules/drainage/tools/manhole_tool'
require_relative '../modules/architecture/tools/roof_framing_tool'
require_relative '../modules/interior/tools/cabinet_run_tool'
require_relative '../modules/interior/tools/wardrobe_tool'
require_relative '../modules/library/tools/asset_tool'
require_relative 'tool_properties'

module JiraNot
  module ConstructFlow
    module Core
      module ShortcutManager
        SHORTCUTS = {
          # Project Setup
          'LV'    => { label: 'ระดับชั้นอาคาร (Level)', action: :level },
          'LEVEL' => { label: 'ระดับชั้นอาคาร (Level)', action: :level },
          'PH'    => { label: 'เฟสการทำงาน (Phase)', action: :phase },
          'PHASE' => { label: 'เฟสการทำงาน (Phase)', action: :phase },

          # Architecture
          'WA'   => { label: 'ผนัง (Wall)', action: :wall },
          'WALL' => { label: 'ผนัง (Wall)', action: :wall },
          'DR'   => { label: 'ประตู (Door)', action: :door },
          'DOOR' => { label: 'ประตู (Door)', action: :door },
          'WN'   => { label: 'หน้าต่าง (Window)', action: :window },
          'WIN'  => { label: 'หน้าต่าง (Window)', action: :window },
          'OP'   => { label: 'เจาะช่องเปิด (Opening)', action: :opening },
          'OPN'  => { label: 'เจาะช่องเปิด (Opening)', action: :opening },
          'FL'   => { label: 'พื้น (Floor)', action: :floor },
          'CE'   => { label: 'ฝ้าเพดาน (Ceiling)', action: :ceiling },
          'CLG'  => { label: 'ฝ้าเพดาน (Ceiling)', action: :ceiling },
          # Roof family — every panel badge in this group is a real, typable
          # code. Never reuse 'RF' for roof framing; that was the old conflict.
          'RF'   => { label: 'หลังคา (Roof)', action: :roof },
          'ROOF' => { label: 'หลังคา (Roof)', action: :roof },
          'FRM'  => { label: 'โครงหลังคาเหล็ก (Roof Framing)', action: :roof_framing },
          'MFR'  => { label: 'แก้ไขโครงหลังคา (Modify Roof Framing)', action: :modify_roof_framing },
          'HGR'  => { label: 'หลังคาปั้นหยา/จั่ว (Hip/Gable Roof)', action: :hip_gable_roof },
          'AR'   => { label: 'หลังคา Auto Revit (Revit Auto Roof)', action: :revit_auto_roof },
          'GT'   => { label: 'รางน้ำฝน (Gutter)', action: :gutter },
          'GUTTER' => { label: 'รางน้ำฝน (Gutter)', action: :gutter },
          # Shell tools (floor/ceiling codes already exist above; stair and
          # curtain wall are new).
          'ST'   => { label: 'บันได (Stair)', action: :stair },
          'CW'   => { label: 'ผนังกระจก/ระแนง (Curtain Wall)', action: :curtain_wall },
          'MCW'  => { label: 'แก้ไขผนังกระจก (Modify Curtain Wall)', action: :modify_curtain_wall },
          'RM'   => { label: 'ตรวจหาห้องอัตโนมัติ (Rooms)', action: :rooms },
          'PV'   => { label: 'ปูกระเบื้องลายพื้น (Paving)', action: :paving },
          'NP'   => { label: 'บันทึกหน้าตัดใหม่ (New Profile)', action: :new_profile },
          'PF'   => { label: 'กวาดบัว/ราวมือจับ (Profile Sweep)', action: :profile_sweep },
          'PS'   => { label: 'กวาดบัวตามเส้นที่เลือก (Sweep on Selection)', action: :sweep_selection },

          # Structure
          'CL'   => { label: 'เสา (Column)', action: :column },
          'CO'   => { label: 'เสา (Column)', action: :column },
          'COL'  => { label: 'เสา (Column)', action: :column },
          'BM'   => { label: 'คาน (Beam)', action: :beam },
          'BEAM' => { label: 'คาน (Beam)', action: :beam },
          'GR'   => { label: 'เส้นกริด (Grid)', action: :grid },
          'GRID' => { label: 'เส้นกริด (Grid)', action: :grid },
          'FD'   => { label: 'ฐานราก (Foundation)', action: :foundation },
          'FT'   => { label: 'ฐานราก (Foundation)', action: :foundation },
          'FND'  => { label: 'ฐานราก (Foundation)', action: :foundation },
          'GF'   => { label: 'กริดโครงสร้าง (Grid Framing)', action: :grid_framing },
          'RB'   => { label: 'เหล็กเสริม 3D (Rebar)', action: :rebar },
          'BBS'  => { label: 'ตารางดัดเหล็ก (BBS)', action: :bbs },

          # MEP
          'CN'   => { label: 'ท่อร้อยสายไฟ (Conduit)', action: :conduit },
          'COND' => { label: 'ท่อร้อยสายไฟ (Conduit)', action: :conduit },
          'PI'   => { label: 'ท่อระบายน้ำ (Pipe)', action: :pipe },
          'PIPE' => { label: 'ท่อระบายน้ำ (Pipe)', action: :pipe },
          'MH'   => { label: 'บ่อพักน้ำทิ้ง (Manhole)', action: :manhole },
          'PB'   => { label: 'ตู้เมนไฟฟ้า (Panelboard)', action: :panelboard },
          'PBD'  => { label: 'ตู้เมนไฟฟ้า (Panelboard)', action: :panelboard },

          # Interior
          'CB'   => { label: 'เคาน์เตอร์บิวท์อิน (Cabinet)', action: :cabinet },
          'CAB'  => { label: 'เคาน์เตอร์บิวท์อิน (Cabinet)', action: :cabinet },
          'WR'   => { label: 'ตู้เสื้อผ้า (Wardrobe)', action: :wardrobe },
          'WARD' => { label: 'ตู้เสื้อผ้า (Wardrobe)', action: :wardrobe },
          'SF'      => { label: 'ผิวพื้นและลายปู (Surface)', action: :surface },
          'SURF'    => { label: 'ผิวพื้นและลายปู (Surface)', action: :surface },
          'SURFACE' => { label: 'ผิวพื้นและลายปู (Surface)', action: :surface },

          # Library & Costing
          'AS'    => { label: 'ครุภัณฑ์สำเร็จรูป (Asset)', action: :asset },
          'ASSET' => { label: 'ครุภัณฑ์สำเร็จรูป (Asset)', action: :asset },
          'CT'    => { label: 'ถอดแบบและราคา (BOQ)', action: :costing },
          'BOQ'   => { label: 'ถอดแบบและราคา (BOQ)', action: :costing },
          'CSV'   => { label: 'ส่งออก BOQ CSV', action: :export_boq_csv },

          # Drawing, annotation and measurement
          'DIM' => { label: 'ดึงระยะ Auto (Auto Dimension)', action: :dimension },
          'EL'  => { label: 'ปักหมุดระดับ (Spot Elevation)', action: :spot_elevation },
          'SCN' => { label: 'Scene LayOut (Scenes)', action: :scenes },
          'SS'  => { label: 'ยืดขอบไม่เพี้ยน (Smart Stretch)', action: :smart_stretch },
          'SA'  => { label: 'ยืดตามพื้นที่ (Stretch by Area)', action: :stretch_area },
          'LS'  => { label: 'เลเซอร์วัดระดับ (Laser Level)', action: :laser_level },
          'AF'  => { label: 'อาร์เรย์บนผิว (Array on Face)', action: :array_face },

          # General
          'CF'   => { label: 'แผง ConstructFlow', action: :panel },
          'IN'   => { label: 'Inspector', action: :inspector },
          'PR'   => { label: 'Inspector', action: :inspector },
          'PROP' => { label: 'Inspector', action: :inspector }
        }.freeze

        @buffer = ''
        @last_time = 0.0

        class << self
          attr_accessor :buffer, :last_time

          def reset_buffer
            @buffer = ''
            @last_time = 0.0
          end

          def handle_key(key, runtime, _view = nil)
            return false unless runtime&.respond_to?(:active_model) && runtime.active_model

            char = key_to_char(key)
            return false unless char

            now = Time.now.to_f
            if now - (@last_time || 0.0) > 1.0 # 1 second typing timeout
              @buffer = ''
            end
            @last_time = now
            @buffer = (@buffer || '') + char

            # Check exact match
            if SHORTCUTS.key?(@buffer)
              sc_code = @buffer
              @buffer = ''
              return execute(sc_code, runtime)
            end

            # Check if prefix matches any shortcut
            has_prefix = SHORTCUTS.keys.any? { |k| k.start_with?(@buffer) }
            if has_prefix
              prompt_shortcut_typing(@buffer)
              return true
            else
              # Try if this single char starts a shortcut
              if SHORTCUTS.keys.any? { |k| k.start_with?(char) }
                @buffer = char
                prompt_shortcut_typing(@buffer)
                return true
              else
                @buffer = ''
                return false
              end
            end
          end

          def prompt_shortcut_typing(buf)
            matches = SHORTCUTS.select { |k, _v| k.start_with?(buf) }
            desc = matches.map { |k, v| "#{k}: #{v[:label]}" }.first(4).join(' | ')
            Sketchup.set_status_text("⌨️ คีย์ลัด: #{buf}_ (#{desc})", (defined?(SB_PROMPT) ? SB_PROMPT : nil)) rescue nil
          end

          def key_to_char(key)
            # A-Z (65-90)
            return key.chr.upcase if key.is_a?(Integer) && key.between?(65, 90)
            # a-z (97-122)
            return key.chr.upcase if key.is_a?(Integer) && key.between?(97, 122)
            nil
          end

          def execute(code, runtime, prompt: false)
            entry = SHORTCUTS[code.to_s.upcase]
            return false unless entry
            return false unless runtime&.respond_to?(:active_model) && runtime.active_model

            # Drawing tools get the compact properties dialog (toolbar buttons
            # pass prompt:true); cancelling aborts before the tool draws.
            params = ToolProperties.collect(
              runtime, code,
              prompt: prompt && ToolProperties.drawing?(code),
              title: "ConstructFlow: #{entry[:label]}"
            )
            return false if params.nil?

            case entry[:action]
            when :wall
              tool = Architecture::Tools::WallTool.new(
                runtime: runtime, thickness_mm: params[:thickness_mm], height_mm: params[:height_mm],
                level_id: resolve_level_id(params[:level_id], runtime)
              )
              runtime.active_model.select_tool(tool)
            when :column
              tool = Structure::Tools::ColumnTool.new(
                runtime: runtime, section_mm: [params[:section_width_mm], params[:section_depth_mm]],
                explicit_height_mm: params[:height_mm],
                base_level_id: resolve_level_id(params[:base_level_id], runtime), top_level_id: params[:top_level_id].to_s
              )
              runtime.active_model.select_tool(tool)
            when :beam
              tool = Structure::Tools::BeamTool.new(
                runtime: runtime, section_mm: [params[:section_width_mm], params[:section_depth_mm]],
                level_id: resolve_level_id(params[:level_id], runtime), base_offset_mm: params[:base_offset_mm]
              )
              runtime.active_model.select_tool(tool)
            when :door
              tool = DoorWindow::Tools::DoorWindowTool.new(
                runtime: runtime, category: params[:category], operation: params[:operation],
                frame_material: params[:frame_material], panel_style: params[:panel_style]
              )
              runtime.active_model.select_tool(tool)
            when :window
              tool = DoorWindow::Tools::DoorWindowTool.new(
                runtime: runtime, category: params[:category], operation: params[:operation],
                frame_material: params[:frame_material], panel_style: params[:panel_style]
              )
              runtime.active_model.select_tool(tool)
            when :opening
              tool = Opening::Tools::OpeningTool.new(
                runtime: runtime, width_mm: params[:width_mm], height_mm: params[:height_mm], sill_mm: params[:sill_mm]
              )
              runtime.active_model.select_tool(tool)
            when :floor
              tool = Architecture::Tools::FloorTool.new(
                runtime: runtime, thickness_mm: params[:thickness_mm],
                level_id: resolve_level_id(params[:level_id], runtime)
              )
              runtime.active_model.select_tool(tool)
            when :ceiling
              tool = Architecture::Tools::CeilingTool.new(
                runtime: runtime, height_mm: params[:height_mm],
                level_id: resolve_level_id(params[:level_id], runtime)
              )
              runtime.active_model.select_tool(tool)
            when :foundation
              tool = Structure::Tools::FoundationTool.new(
                runtime: runtime,
                size_mm: [params[:size_width_mm], params[:size_length_mm], params[:size_depth_mm]],
                foundation_type: params[:foundation_type]
              )
              runtime.active_model.select_tool(tool)
            when :grid
              tool = Structure::Tools::GridTool.new(
                runtime: runtime, name: params[:name],
                level_id: resolve_level_id(params[:level_id], runtime), offset_mm: params[:offset_mm]
              )
              runtime.active_model.select_tool(tool)
            when :conduit
              tool = Electrical::Tools::ConduitTool.new(
                runtime: runtime, ceiling_z_mm: params[:ceiling_z_mm], strategy: params[:strategy]
              )
              runtime.active_model.select_tool(tool)
            when :pipe
              tool = Drainage::Tools::PipeTool.new(
                runtime: runtime, diameter_mm: params[:diameter_mm], system: params[:system]
              )
              runtime.active_model.select_tool(tool)
            when :manhole
              tool = Drainage::Tools::ManholeTool.new(
                runtime: runtime, size_mm: [params[:size_width_mm], params[:size_length_mm]],
                cover_level_mm: params[:cover_level_mm], invert_in_mm: params[:invert_in_mm],
                invert_out_mm: params[:invert_out_mm]
              )
              runtime.active_model.select_tool(tool)
            when :cabinet
              tool = Interior::Tools::CabinetRunTool.new(
                runtime: runtime,
                params: {
                  width_mm: params[:width_mm], depth_mm: params[:depth_mm],
                  height_mm: params[:height_mm], module_count: params[:module_count]
                }
              )
              runtime.active_model.select_tool(tool)
            when :wardrobe
              tool = Interior::Tools::WardrobeTool.new(
                runtime: runtime, width_mm: params[:width_mm], depth_mm: params[:depth_mm],
                height_mm: params[:height_mm], door_type: params[:door_type]
              )
              runtime.active_model.select_tool(tool)
            when :level
              prompt_create_level(runtime)
            when :phase
              prompt_set_phase(runtime)
            when :roof
              prompt_roof(runtime)
            when :roof_framing
              runtime.active_model.select_tool(Architecture::Tools::RoofFramingTool.new(settings: params))
            when :modify_roof_framing
              Architecture::Tools::RoofFramingTool.modify_selected(runtime.active_model, settings: params)
            when :hip_gable_roof
              run_panel_action(runtime, 'generate_hip_gable_roof', params)
            when :revit_auto_roof
              run_panel_action(runtime, 'revit_auto_roof', params)
            when :gutter
              prompt_gutter(runtime)
            when :panelboard
              prompt_panelboard(runtime)
            when :surface
              prompt_surface(runtime)
            when :asset
              tool = Library::Tools::AssetTool.new(
                runtime: runtime, asset_id: params[:asset_id].to_s, rotation_deg: params[:rotation_deg]
              )
              runtime.active_model.select_tool(tool)
            when :costing
              show_costing_summary(runtime)
            when :grid_framing
              run_panel_action(runtime, 'draw_grid_framing')
            when :rebar
              run_panel_action(runtime, 'assign_rebar')
            when :bbs
              run_panel_action(runtime, 'show_bbs')
            when :stair
              run_panel_action(runtime, 'draw_stair')
            when :curtain_wall
              run_panel_action(runtime, 'draw_curtain_wall')
            when :modify_curtain_wall
              run_panel_action(runtime, 'modify_curtain_wall')
            when :rooms
              run_panel_action(runtime, 'detect_rooms')
            when :paving
              run_panel_action(runtime, 'generate_paving')
            when :new_profile
              run_panel_action(runtime, 'save_custom_profile')
            when :profile_sweep
              run_panel_action(runtime, 'draw_profile_sweep')
            when :sweep_selection
              run_panel_action(runtime, 'sweep_on_selection')
            when :dimension
              run_panel_action(runtime, 'auto_dimension')
            when :spot_elevation
              run_panel_action(runtime, 'activate_spot_elevation')
            when :scenes
              run_panel_action(runtime, 'generate_extension_scenes')
            when :smart_stretch
              run_panel_action(runtime, 'smart_stretch')
            when :stretch_area
              run_panel_action(runtime, 'stretch_by_area')
            when :laser_level
              run_panel_action(runtime, 'use_laser_level')
            when :array_face
              run_panel_action(runtime, 'array_on_face')
            when :export_boq_csv
              run_panel_action(runtime, 'export_boq_csv')
            when :panel
              HtmlDialogManager.open_panel(runtime)
            when :inspector
              runtime.show_inspector if runtime.respond_to?(:show_inspector)
            end

            msg = "⚡ ConstructFlow [#{code}]: เรียกใช้ #{entry[:label]}"
            Sketchup.set_status_text(msg, (defined?(SB_PROMPT) ? SB_PROMPT : nil)) rescue nil
            HtmlDialogManager.toast(msg, level: 'info') rescue nil
            true
          rescue StandardError => e
            warn "[ConstructFlow] Shortcut execution error (#{code}): #{e.message}"
            false
          end

          # --- Parameter prompts for tools without an interactive drawing mode ---

          def prompt_create_level(runtime)
            params = ToolProperties.collect(runtime, 'LV', prompt: true, title: 'ConstructFlow: กำหนดระดับชั้นอาคาร')
            return false unless params

            id = "level_#{params[:name].to_s.downcase.gsub(/[^a-z0-9]/, '_')}_#{Time.now.to_i}"
            result = runtime.commands.execute(
              'CreateLevel',
              { id: id, name: params[:name].to_s, elevation_mm: params[:elevation_mm], kind: params[:kind].to_s },
              project_id: runtime.project.project_id
            )
            if result[:status] == 'success'
              UI.messagebox("สร้างระดับชั้น #{params[:name]} (+#{params[:elevation_mm]} mm) เรียบร้อยแล้ว")
            else
              UI.messagebox(Array(result[:errors]).join("\n"))
            end
            true
          rescue StandardError => e
            UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
            false
          end

          def prompt_set_phase(runtime)
            params = ToolProperties.collect(runtime, 'PH', prompt: true, title: 'ConstructFlow: กำหนดเฟสการทำงาน')
            return false unless params

            result = runtime.commands.execute(
              'SetWorkingPhase',
              { phase: params[:phase].to_s.strip },
              project_id: runtime.project.project_id
            )
            if result[:status] == 'success'
              UI.messagebox("สลับเฟสการทำงานปัจจุบันเป็น: #{params[:phase]}")
            else
              UI.messagebox(Array(result[:errors]).join("\n"))
            end
            true
          rescue StandardError => e
            UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
            false
          end

          def prompt_roof(runtime)
            face = runtime.active_model.selection.find { |e| e.is_a?(Sketchup::Face) }
            unless face
              UI.messagebox('กรุณาเลือกพื้นผิว (Face) ที่ต้องการสร้างหลังคาก่อน')
              return false
            end

            params = ToolProperties.collect(runtime, 'RF', prompt: true, title: 'ConstructFlow: สร้างระบบหลังคา')
            return false unless params

            boundary = face.outer_loop.vertices.map { |v| Core::Units.point_to_mm(v.position) }
            result = runtime.commands.execute(
              'GenerateRoof',
              { boundary_mm: boundary, covering_system: params[:covering_system].to_s,
                slope_percent: params[:slope_percent],
                slope_direction_xy: [params[:slope_direction_x], params[:slope_direction_y]] },
              project_id: runtime.project.project_id
            )
            message = result[:status] == 'success' ? 'สร้างระบบหลังคาสำเร็จ' : Array(result[:errors]).join("\n")
            UI.messagebox(message)
            true
          rescue StandardError => e
            UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
            false
          end

          def prompt_gutter(runtime)
            roof = runtime.active_model.selection
                          .filter_map { |e| runtime.smart_objects.fetch(e) rescue nil }
                          .find { |o| o.type == 'roof.system' }
            unless roof
              UI.messagebox('กรุณาเลือกวัตถุหลังคา (Roof) ก่อนเพื่อติดตั้งรางน้ำฝน')
              return false
            end

            params = ToolProperties.collect(runtime, 'GT', prompt: true, title: 'ConstructFlow: ติดตั้งรางน้ำฝน')
            return false unless params

            result = runtime.commands.execute(
              'AddGutter',
              { roof_object_id: roof.id, edge_index: params[:edge_index], outlet_ratio: params[:outlet_ratio] },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:status] == 'success' ? 'ติดตั้งรางน้ำฝนสำเร็จ' : Array(result[:errors]).join("\n"))
            true
          rescue StandardError => e
            UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
            false
          end

          def prompt_panelboard(runtime)
            params = ToolProperties.collect(runtime, 'PB', prompt: true, title: 'ConstructFlow: ติดตั้งตู้ควบคุมไฟฟ้า')
            return false unless params

            result = runtime.commands.execute(
              'CreatePanelboard',
              { id: "panel_#{params[:name].to_s.downcase.gsub(/[^a-z0-9]/, '_')}", name: params[:name].to_s,
                phase_config: params[:phase_config].to_s, voltage_v: params[:voltage_v],
                main_breaker_a: params[:main_breaker_a], bus_rating_a: params[:bus_rating_a],
                max_circuits: params[:max_circuits] },
              project_id: runtime.project.project_id
            )
            message = result[:status] == 'success' ? "สร้างตู้ควบคุมไฟฟ้า #{params[:name]} เรียบร้อยแล้ว" : Array(result[:errors]).join("\n")
            UI.messagebox(message)
            true
          rescue StandardError => e
            UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
            false
          end

          def prompt_surface(runtime)
            face = runtime.active_model.selection.find { |e| e.is_a?(Sketchup::Face) }
            unless face
              UI.messagebox('กรุณาเลือกพื้นผิว (Face) ที่ต้องการปูผิวพื้นก่อน')
              return false
            end

            params = ToolProperties.collect(runtime, 'SF', prompt: true, title: 'ConstructFlow: ปูผิวพื้น')
            return false unless params

            outer = face.outer_loop.vertices.map { |v| Core::Units.point_to_mm(v.position) }
            holes = face.loops.reject(&:outer?).map { |l| l.vertices.map { |v| Core::Units.point_to_mm(v.position) } }
            result = runtime.commands.execute(
              'CreateSurfaceBoundary',
              { outer_boundary_mm: outer, holes_mm: holes, surface_type: params[:surface_type].to_s },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:status] == 'success' ? 'ปูผิวพื้นสำเร็จ' : Array(result[:errors]).join("\n"))
            true
          rescue StandardError => e
            UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
            false
          end

          def show_costing_summary(runtime)
            boq = HtmlDialogManager.generate_boq_data(runtime)
            category_lines = boq[:categories].map do |category|
              "#{category[:name]}: #{category[:subtotal]} บาท (#{category[:items].size} รายการ)"
            end
            lines = [
              '=== ConstructFlow: สรุปปริมาณงานและราคา (BOQ) ===',
              "รหัสโครงการ: #{boq[:project_id]}",
              "เฟสการทำงาน: #{boq[:phase]}",
              '',
              *category_lines,
              '',
              "รวมเงินทั้งสิ้น: #{boq[:grand_total]} บาท"
            ]
            UI.messagebox(lines.join("\n"))
            true
          rescue StandardError => e
            UI.messagebox("เกิดข้อผิดพลาด: #{e.message}")
            false
          end

          # Reuses the panel's own action table so roof-family commands stay in
          # one place instead of being duplicated here.
          def run_panel_action(runtime, action_name, params = {})
            handler = HtmlDialogManager::ACTIONS[action_name]
            raise "unknown panel action: #{action_name}" unless handler

            handler.call(runtime, panel_payload(params))
          end

          # Panel handlers read string keys, but ToolProperties yields symbol
          # keys. Normalise once so both entry points agree.
          def panel_payload(params)
            params.each_with_object({}) { |(key, value), acc| acc[key.to_s] = value }
          end

          # A blank level id means "use the project's default level".
          def resolve_level_id(level_id, runtime)
            level_id.to_s.strip.empty? ? default_level_id(runtime) : level_id.to_s
          end

          def default_level_id(runtime)
            if runtime.respond_to?(:levels) && runtime.levels
              if runtime.levels.respond_to?(:values) && runtime.levels.values.first
                l = runtime.levels.values.first
                l.respond_to?(:id) ? l.id : l.to_s
              elsif runtime.levels.is_a?(Array) && runtime.levels.first
                l = runtime.levels.first
                l.respond_to?(:id) ? l.id : l.to_s
              else
                ''
              end
            else
              ''
            end
          rescue StandardError
            ''
          end
        end
      end
    end
  end
end
