# frozen_string_literal: true

require 'json'
require_relative 'i18n'

module JiraNot
  module ConstructFlow
    module Core
      # HtmlDialogManager — Singleton that owns the floating ConstructFlow panel.
      #
      # Opens a UI::HtmlDialog (SketchUp 2017+) backed by ui/panel.html.
      # Communication:
      #   JS  → Ruby : dialog.add_action_callback("dispatch") { |d, json| ... }
      #   Ruby → JS  : dialog.execute_script("CF.receive(#{payload.to_json})")
      module HtmlDialogManager
        UI_DIR = File.expand_path(File.join(__dir__, '..', 'ui')).freeze

        module_function

        # ── Public API ───────────────────────────────────────────
        def open_panel(runtime)
          if @dialog && @dialog.visible?
            @dialog.bring_to_front
            push_state(runtime)
            return
          end

          @runtime = runtime
          @dialog = build_dialog
          register_callbacks(@dialog, runtime)
          @dialog.set_file(File.join(UI_DIR, 'panel.html'))
          @dialog.show
          setup_selection_observer(runtime)
          # Push initial state after the dialog has had a moment to render
          @dialog.add_action_callback('panel_ready') do
            push_state(runtime)
            push_selection(runtime)
          end
        end

        def close_panel
          @dialog&.close
          @dialog = nil
        end

        def visible?
          @dialog&.visible? || false
        end

        # Push current project state → JS
        def push_state(runtime)
          return unless @dialog&.visible?

          state = build_state(runtime)
          payload = { type: 'state', state: state }.to_json
          @dialog.execute_script("CF.receive(#{payload.to_json})")
        rescue StandardError => e
          warn "[ConstructFlow] push_state error: #{e.message}"
        end

        # Push selected object info → JS
        def push_selection(runtime)
          return unless @dialog&.visible?

          selected_info = nil
          if defined?(runtime.active_model) && runtime.active_model
            sel = runtime.active_model.selection
            if sel && sel.length == 1
              entity = sel.first
              smart_obj = (Core::RepresentationObjectResolver.resolve(runtime, entity) rescue nil)
              if smart_obj
                selected_info = serialize_smart_object(runtime, smart_obj, entity)
              end
            end
          end

          payload = { type: 'selection', selected: selected_info }.to_json
          @dialog.execute_script("CF.receive(#{payload.to_json})")
        rescue StandardError => e
          warn "[ConstructFlow] push_selection error: #{e.message}"
        end

        def setup_selection_observer(runtime)
          return unless defined?(Sketchup::SelectionObserver)
          return unless runtime.respond_to?(:active_model) && runtime.active_model

          @selection_observer ||= Class.new(Sketchup::SelectionObserver) do
            def initialize(mgr, rt)
              @mgr = mgr
              @rt = rt
            end

            def onSelectionBulkChange(_selection)
              @mgr.push_selection(@rt)
            end

            def onSelectionCleared(_selection)
              @mgr.push_selection(@rt)
            end
          end.new(self, runtime)

          runtime.active_model.selection.remove_observer(@selection_observer) rescue nil
          runtime.active_model.selection.add_observer(@selection_observer) rescue nil
        end

        # Send a toast notification → JS
        def toast(message, level: 'info')
          return unless @dialog&.visible?

          payload = { type: 'toast', message: message, level: level }.to_json
          @dialog.execute_script("CF.receive(#{payload.to_json})")
        rescue StandardError
          nil
        end

        # ── Private Helpers ──────────────────────────────────────
        private_class_method def build_dialog
          props = {
            dialog_title:    'ConstructFlow',
            scrollable:      true,
            resizable:       true,
            width:           340,
            height:          680,
            left:            100,
            top:             100,
            min_width:       300,
            min_height:      400,
            style:           UI::HtmlDialog::STYLE_UTILITY
          }
          if defined?(UI::HtmlDialog)
            UI::HtmlDialog.new(props)
          else
            raise 'UI::HtmlDialog not available — requires SketchUp 2017+'
          end
        end

        private_class_method def register_callbacks(dialog, runtime)
          # Primary dispatch — JS calls sketchup.dispatch(jsonStr)
          dialog.add_action_callback('dispatch') do |_d, json_str|
            handle_dispatch(json_str, runtime)
          end

          # Named callbacks map (each JS action registers directly)
          ACTIONS.each_key do |action_name|
            dialog.add_action_callback(action_name) do |_d, json_str|
              handle_dispatch(json_str, runtime, action_name)
            end
          end

          # Close button / window close
          dialog.set_on_closed { @dialog = nil }
        end

        private_class_method def handle_dispatch(json_str, runtime, forced_action = nil)
          data = JSON.parse(json_str.to_s)
          action = forced_action || data['action']
          params = data['params'] || {}

          handler = ACTIONS[action]
          unless handler
            toast("ไม่รู้จักคำสั่ง: #{action}", level: 'error')
            return
          end

          result = handler.call(runtime, params)
          push_state(runtime) if result != :no_state_push
        rescue JSON::ParserError => e
          toast("JSON error: #{e.message}", level: 'error')
        rescue StandardError => e
          toast("เกิดข้อผิดพลาด: #{e.message}", level: 'error')
          warn "[ConstructFlow] dispatch error (#{action}): #{e.message}\n#{e.backtrace.first(3).join("\n")}"
        end

        private_class_method def build_state(runtime)
          levels_list = begin
            if runtime.respond_to?(:levels) && runtime.levels
              levs = runtime.levels.respond_to?(:values) ? runtime.levels.values : runtime.levels.to_a
              levs.map do |l|
                elev_mm = (l.respond_to?(:elevation_mm) ? l.elevation_mm : 0).to_f
                {
                  id:           (l.respond_to?(:id) ? l.id : (l.respond_to?(:name) ? l.name : '')).to_s,
                  name:         (l.respond_to?(:name) ? l.name : '').to_s,
                  elevation_mm: elev_mm,
                  elevation_m:  (elev_mm / 1000.0).round(2),
                  kind:         (l.respond_to?(:kind) ? l.kind : 'floor').to_s
                }
              end
            else
              []
            end
          rescue StandardError
            []
          end

          {
            project_id:    runtime.project&.project_id || '—',
            phase:         runtime.project&.working_phase || 'new_construction',
            levels:        runtime.levels&.size || 0,
            levels_list:   levels_list,
            smart_objects: runtime.smart_objects&.size || 0,
            connectors:    runtime.connectors&.connector_count || 0,
            modules:       runtime.modules&.size || 0
          }
        end

        private_class_method def serialize_smart_object(runtime, smart_obj, entity)
          type_labels = {
            'architecture.wall'     => '🧱 ผนังอัจฉริยะ (Smart Wall)',
            'structure.column'      => '🏛 เสาคอนกรีต (RC Column)',
            'structure.beam'        => '🏗 คานโครงสร้าง (Beam)',
            'structure.foundation'  => '🟫 ฐานราก (Foundation)',
            'structure.grid'        => '📐 เส้นกริด (Grid)',
            'door_window.instance'  => '🚪 ประตู/หน้าต่าง (Door/Window)',
            'opening.wall_opening'  => '🔲 ช่องเปิดผนัง (Opening)',
            'drainage.manhole'      => '⚪ บ่อพัก (Manhole)',
            'drainage.pipe_route'   => '🔵 ท่อระบายน้ำ (Pipe)',
            'electrical.conduit_route' => '⚡ ท่อร้อยสายไฟ (Conduit)',
            'interior.cabinet_run'  => '🛋 ตู้เคาน์เตอร์ (Cabinet)',
            'interior.wardrobe'     => '🚪 ตู้เสื้อผ้า (Wardrobe)'
          }

          props = {}
          begin
            if smart_obj.type == 'architecture.wall' && defined?(Architecture::WallRepository)
              definition = Architecture::WallRepository.new.read(entity)
              if definition
                props['ความยาว (L)'] = "#{format('%.2f', definition.length_mm / 1000.0)} m"
                props['ความหนา (T)'] = "#{format('%.2f', definition.thickness_mm / 1000.0)} m"
                props['ความสูง (H)'] = "#{format('%.2f', definition.height_mm / 1000.0)} m"
                area_sqm = (definition.length_mm * definition.height_mm) / 1_000_000.0
                vol_cum  = (definition.length_mm * definition.height_mm * definition.thickness_mm) / 1_000_000_000.0
                props['พื้นที่ (Area)'] = "#{area_sqm.round(2)} ตร.ม."
                props['ปริมาตร (Vol)'] = "#{vol_cum.round(3)} คิว (m³)"
                props['ทิศทาง'] = definition.orientation.to_s
              end
            end
          rescue StandardError
            nil
          end

          level_id = smart_obj.level_refs&.first if smart_obj.respond_to?(:level_refs)
          if level_id.is_a?(Hash)
            level_id = level_id[:level_id] || level_id['level_id']
          end

          {
            id:         smart_obj.id.to_s,
            type:       smart_obj.type.to_s,
            badge:      type_labels[smart_obj.type.to_s] || "📦 #{smart_obj.type}",
            name:       smart_obj.display_name.to_s.empty? ? (type_labels[smart_obj.type.to_s] || smart_obj.type) : smart_obj.display_name,
            level_id:   level_id.to_s,
            phase:      smart_obj.created_phase.to_s,
            properties: props
          }
        end

        # ── Action Dispatch Table ────────────────────────────────
        # Each lambda receives (runtime, params) and returns a result.
        # Return :no_state_push if you don't want a state refresh after.
        def self.generate_boq_data(runtime)
          objects = begin
            runtime.smart_objects.all
          rescue StandardError
            []
          end

          structure_vol = 0.0
          structure_formwork = 0.0
          column_count = 0
          beam_count = 0
          foundation_count = 0

          wall_area = 0.0
          wall_vol = 0.0
          floor_area = 0.0
          ceiling_area = 0.0
          door_window_count = 0

          conduit_len = 0.0
          pipe_len = 0.0
          manhole_count = 0
          panel_count = 0

          wall_repo = defined?(Architecture::WallRepository) ? Architecture::WallRepository.new : nil

          objects.each do |obj|
            case obj.type
            when 'structure.column'
              column_count += 1
              structure_vol += 0.12
              structure_formwork += 2.4
            when 'structure.beam'
              beam_count += 1
              structure_vol += 0.32
              structure_formwork += 4.0
            when 'structure.foundation'
              foundation_count += 1
              structure_vol += 0.5
            when 'architecture.wall'
              if wall_repo && obj.entity
                def_wall = wall_repo.read(obj.entity) rescue nil
                if def_wall
                  wall_area += (def_wall.gross_area_mm2 rescue 0) / 1_000_000.0
                  wall_vol += (def_wall.volume_mm3 rescue 0) / 1_000_000_000.0
                else
                  wall_area += 12.0
                  wall_vol += 1.2
                end
              else
                wall_area += 12.0
                wall_vol += 1.2
              end
            when 'architecture.floor'
              floor_area += 25.0
            when 'architecture.ceiling'
              ceiling_area += 25.0
            when 'opening.door_window', 'opening.door', 'opening.window'
              door_window_count += 1
            when 'mep.conduit'
              conduit_len += 15.0
            when 'mep.pipe'
              pipe_len += 12.0
            when 'mep.manhole'
              manhole_count += 1
            when 'mep.panelboard'
              panel_count += 1
            end
          end

          structure_items = []
          arch_items = []
          mep_items = []

          # Structure items
          if foundation_count > 0 || objects.empty?
            qty = foundation_count > 0 ? (foundation_count * 0.5).round(2) : 2.5
            structure_items << { code: 'STR-01', name: 'คอนกรีตฐานราก 240 ksc', unit: 'ลบ.ม.', qty: qty, mat_rate: 2100.0, lab_rate: 450.0, total: (qty * 2550.0).round(2) }
          end
          if column_count > 0 || objects.empty?
            qty = column_count > 0 ? (column_count * 0.12).round(2) : 1.2
            structure_items << { code: 'STR-02', name: 'คอนกรีตเสาโครงสร้าง 240 ksc', unit: 'ลบ.ม.', qty: qty, mat_rate: 2250.0, lab_rate: 550.0, total: (qty * 2800.0).round(2) }
          end
          if beam_count > 0 || objects.empty?
            qty = beam_count > 0 ? (beam_count * 0.32).round(2) : 2.8
            structure_items << { code: 'STR-03', name: 'คอนกรีตคานโครงสร้าง 240 ksc', unit: 'ลบ.ม.', qty: qty, mat_rate: 2250.0, lab_rate: 520.0, total: (qty * 2770.0).round(2) }
          end
          if structure_formwork > 0 || objects.empty?
            qty = structure_formwork > 0 ? structure_formwork.round(2) : 35.0
            structure_items << { code: 'STR-04', name: 'ไม้แบบหล่อโครงสร้าง + ค้ำยัน', unit: 'ตร.ม.', qty: qty, mat_rate: 280.0, lab_rate: 150.0, total: (qty * 430.0).round(2) }
          end

          # Architecture items
          if wall_area > 0 || objects.empty?
            qty = wall_area > 0 ? wall_area.round(2) : 48.0
            arch_items << { code: 'ARC-01', name: 'ผนังก่ออิฐมวลเบาหนา 7.5 ซม.', unit: 'ตร.ม.', qty: qty, mat_rate: 260.0, lab_rate: 120.0, total: (qty * 380.0).round(2) }
            arch_items << { code: 'ARC-02', name: 'ฉาบปูนเรียบภายใน-ภายนอก 2 ด้าน', unit: 'ตร.ม.', qty: (qty * 2).round(2), mat_rate: 120.0, lab_rate: 110.0, total: ((qty * 2) * 230.0).round(2) }
          end
          if floor_area > 0 || objects.empty?
            qty = floor_area > 0 ? floor_area.round(2) : 60.0
            arch_items << { code: 'ARC-03', name: 'พื้นคอนกรีตเสริมเหล็กหล่อในที่ / สำเร็จรูป', unit: 'ตร.ม.', qty: qty, mat_rate: 350.0, lab_rate: 120.0, total: (qty * 470.0).round(2) }
          end
          if ceiling_area > 0 || objects.empty?
            qty = ceiling_area > 0 ? ceiling_area.round(2) : 55.0
            arch_items << { code: 'ARC-04', name: 'ฝ้าเพดานยิปซัมบอร์ด 9 มม. ฉาบเรียบโครง C-Line', unit: 'ตร.ม.', qty: qty, mat_rate: 220.0, lab_rate: 130.0, total: (qty * 350.0).round(2) }
          end
          if door_window_count > 0 || objects.empty?
            qty = door_window_count > 0 ? door_window_count : 4
            arch_items << { code: 'ARC-05', name: 'ชุดประตู-หน้าต่างอลูมิเนียมพร้อมกระจก', unit: 'ชุด', qty: qty, mat_rate: 3800.0, lab_rate: 600.0, total: (qty * 4400.0).round(2) }
          end

          # MEP items
          if pipe_len > 0 || objects.empty?
            qty = pipe_len > 0 ? pipe_len.round(2) : 24.0
            mep_items << { code: 'MEP-01', name: 'ท่อระบายน้ำ PVC ชั้น 8.5 ขนาด 4 นิ้ว', unit: 'ม.', qty: qty, mat_rate: 180.0, lab_rate: 90.0, total: (qty * 270.0).round(2) }
          end
          if manhole_count > 0 || objects.empty?
            qty = manhole_count > 0 ? manhole_count : 3
            mep_items << { code: 'MEP-02', name: 'บ่อพักคอนกรีตสำเร็จรูปพร้อมฝาปิด', unit: 'บ่อ', qty: qty, mat_rate: 850.0, lab_rate: 350.0, total: (qty * 1200.0).round(2) }
          end
          if conduit_len > 0 || objects.empty?
            qty = conduit_len > 0 ? conduit_len.round(2) : 45.0
            mep_items << { code: 'MEP-03', name: 'ท่อร้อยสายไฟ uPVC/EMT พร้อมสาย THW', unit: 'ม.', qty: qty, mat_rate: 95.0, lab_rate: 75.0, total: (qty * 170.0).round(2) }
          end
          if panel_count > 0 || objects.empty?
            qty = panel_count > 0 ? panel_count : 1
            mep_items << { code: 'MEP-04', name: 'ตู้ควบคุมไฟฟ้าหลัก Consumer Unit 8 ช่อง', unit: 'ตู้', qty: qty, mat_rate: 4500.0, lab_rate: 1200.0, total: (qty * 5700.0).round(2) }
          end

          str_subtotal = structure_items.sum { |i| i[:total] }.round(2)
          arc_subtotal = arch_items.sum { |i| i[:total] }.round(2)
          mep_subtotal = mep_items.sum { |i| i[:total] }.round(2)
          grand_total = (str_subtotal + arc_subtotal + mep_subtotal).round(2)

          {
            project_id: (runtime.project&.project_id rescue 'PROJ-DEMO'),
            phase: (runtime.project&.working_phase rescue 'new_construction'),
            currency: 'THB',
            grand_total: grand_total,
            categories: [
              { name: '1. หมวดงานโครงสร้าง (Structure)', subtotal: str_subtotal, items: structure_items },
              { name: '2. หมวดงานสถาปัตยกรรม (Architecture)', subtotal: arc_subtotal, items: arch_items },
              { name: '3. หมวดงานระบบสุขาภิบาลและไฟฟ้า (MEP)', subtotal: mep_subtotal, items: mep_items }
            ]
          }
        end

        ACTIONS = {
          # -- Inspector -------------------------------------------
          'show_inspector' => lambda { |runtime, _p|
            recent = runtime.diagnostics.recent(5).map { |e| "[#{e.severity}] #{e.code}: #{e.message}" }
            lines = [
              "รหัสโครงการ: #{runtime.project&.project_id || '—'}",
              "เฟส: #{runtime.project&.working_phase || '—'}",
              "Smart Objects: #{runtime.smart_objects&.size || 0}",
              "Levels: #{runtime.levels&.size || 0}",
              '',
              'บันทึกล่าสุด:',
              *(recent.empty? ? ['(ไม่มีบันทึก)'] : recent)
            ].join("\n")
            UI.messagebox(lines)
            :no_state_push
          },

          'get_state' => lambda { |_runtime, _p|
            nil # state is pushed automatically after dispatch
          },

          'zoom_selected' => lambda { |runtime, _p|
            sel = runtime.active_model.selection
            if sel && sel.any?
              runtime.active_model.active_view.zoom(sel.to_a) rescue nil
            end
            :no_state_push
          },

          'flip_selected_wall' => lambda { |runtime, _p|
            sel = runtime.active_model.selection
            target = sel.filter_map { |e| Core::RepresentationObjectResolver.resolve(runtime, e) rescue nil }
                        .find { |o| o.type == 'architecture.wall' }
            raise 'กรุณาเลือกผนังในโมเดลก่อนสลับด้าน' unless target

            result = runtime.commands.execute('FlipWallOrientation', { object_id: target.id }, project_id: runtime.project.project_id)
            if result[:status] == 'success'
              HtmlDialogManager.toast('สลับด้านผนังสำเร็จ', level: 'success')
              HtmlDialogManager.push_selection(runtime)
            else
              HtmlDialogManager.toast(result[:errors].join(', '), level: 'error')
            end
          },

          'trigger_shortcut' => lambda { |runtime, p|
            code = p['code'].to_s.strip.upcase
            success = Core::ShortcutManager.execute(code, runtime)
            unless success
              HtmlDialogManager.toast("ไม่พบคีย์ลัด: #{code}", level: 'warning')
            end
            :no_state_push
          },

          'delete_selected' => lambda { |runtime, _p|
            sel = runtime.active_model.selection
            if sel && sel.any?
              entities = sel.to_a
              entities.each do |e|
                runtime.smart_objects.delete(e) rescue nil
                e.erase! if e.valid? rescue nil
              end
              HtmlDialogManager.toast('ลบชิ้นงานสำเร็จ', level: 'success')
              HtmlDialogManager.push_selection(runtime)
            else
              raise 'กรุณาเลือกชิ้นงานก่อนลบ'
            end
          },

          'update_selected_wall' => lambda { |runtime, p|
            sel = runtime.active_model.selection
            target = sel.filter_map { |e| Core::RepresentationObjectResolver.resolve(runtime, e) rescue nil }
                        .find { |o| o.type == 'architecture.wall' }
            raise 'กรุณาเลือกผนังในโมเดลก่อนแก้ไข' unless target

            repo = Architecture::WallRepository.new
            definition = repo.read(target.entity)
            raise 'ไม่พบข้อมูลความกว้าง/ความสูงของผนังนี้' unless definition

            new_thickness = p['thickness_mm'] ? p['thickness_mm'].to_f : definition.thickness_mm
            new_height = p['height_mm'] ? p['height_mm'].to_f : definition.height_mm
            raise 'ความหนาผนังต้องมากกว่า 0' unless new_thickness.positive?
            raise 'ความสูงผนังต้องมากกว่า 0' unless new_height.positive?

            updated_def = definition.with(
              thickness_mm: new_thickness,
              height_mm: new_height
            )
            repo.write(target.entity, updated_def)
            openings = repo.host_openings(target.entity) rescue []
            Architecture::WallGeometry.new.rebuild!(target.entity, updated_def, openings: openings)
            runtime.smart_objects.mark_dirty_with_dependents(target.entity, 'dirty_quantity', 'dirty_drawing')
            HtmlDialogManager.toast('อัปเดตขนาดผนังสำเร็จ', level: 'success')
          },

          'edit_selected_wall' => lambda { |runtime, _p|
            runtime.active_model.select_tool(
              Architecture::Tools::WallEditTool.new(runtime: runtime)
            )
            :no_state_push
          },

          'get_boq_data' => lambda { |runtime, _p|
            boq = HtmlDialogManager.generate_boq_data(runtime)
            HtmlDialogManager.execute_script("ConstructFlowUI.renderBOQ(#{boq.to_json});")
            :no_state_push
          },

          # -- Setup -----------------------------------------------
          'create_level' => lambda { |runtime, p|
            name  = p['name'].to_s.strip
            raise 'กรุณาระบุชื่อระดับชั้น' if name.empty?

            id = "level_#{name.downcase.gsub(/[^a-z0-9]/, '_')}_#{Time.now.to_i}"
            runtime.levels.register(
              id:           id,
              name:         name,
              elevation_mm: p['elevation_mm'].to_f,
              kind:         p['kind'].to_s.empty? ? 'floor' : p['kind'].to_s,
              source_state: 'confirmed'
            )
            HtmlDialogManager.toast("สร้างระดับชั้น \"#{name}\" (+#{p['elevation_mm']} mm) สำเร็จ", level: 'success')
          },

          'set_phase' => lambda { |runtime, p|
            phase = p['phase'].to_s.strip
            valid = %w[existing demolition new_construction]
            raise "เฟสไม่ถูกต้อง: #{phase}" unless valid.include?(phase)

            runtime.project.working_phase = phase
            HtmlDialogManager.toast("เปลี่ยนเฟสเป็น: #{phase}", level: 'success')
          },

          # -- Structure -------------------------------------------
          'place_foundation' => lambda { |runtime, p|
            size = (p['size_mm'] || [1000, 1000, 400]).map(&:to_f)
            runtime.active_model.select_tool(
              Structure::Tools::FoundationTool.new(
                runtime:         runtime,
                size_mm:         size,
                foundation_type: p['foundation_type'].to_s
              )
            )
            :no_state_push
          },

          'place_column' => lambda { |runtime, p|
            section = (p['section_mm'] || [200, 200]).map(&:to_f)
            anchor = (p['anchor'] || :center).to_sym
            profile_code = p['profile_code']
            runtime.active_model.select_tool(
              Structure::Tools::ColumnTool.new(
                runtime:           runtime,
                section_mm:        section,
                explicit_height_mm: p['height_mm'].to_f > 0 ? p['height_mm'].to_f : 2800.0,
                base_level_id:     p['base_level_id'].to_s,
                top_level_id:      p['top_level_id'].to_s,
                anchor:            anchor,
                profile_code:      profile_code
              )
            )
            :no_state_push
          },

          'draw_beam' => lambda { |runtime, p|
            section = (p['section_mm'] || [200, 300]).map(&:to_f)
            anchor = (p['anchor'] || :top_center).to_sym
            profile_code = p['profile_code']
            runtime.active_model.select_tool(
              Structure::Tools::BeamTool.new(
                runtime:        runtime,
                section_mm:     section,
                level_id:       p['level_id'].to_s,
                base_offset_mm: p['base_offset_mm'].to_f,
                anchor:         anchor,
                profile_code:   profile_code
              )
            )
            :no_state_push
          },

          'draw_grid' => lambda { |runtime, p|
            runtime.active_model.select_tool(
              Structure::Tools::GridTool.new(
                runtime:   runtime,
                name:      p['name'] || 'Grid',
                level_id:  p['level_id'].to_s,
                offset_mm: p['offset_mm'].to_f
              )
            )
            :no_state_push
          },

          # -- Architecture ----------------------------------------
          'draw_wall' => lambda { |runtime, p|
            runtime.active_model.select_tool(
              Architecture::Tools::WallTool.new(
                runtime:       runtime,
                thickness_mm:  p['thickness_mm'].to_f,
                height_mm:     p['height_mm'].to_f,
                level_id:      p['level_id'].to_s
              )
            )
            :no_state_push
          },

          'cut_opening' => lambda { |runtime, p|
            runtime.active_model.select_tool(
              Opening::Tools::OpeningTool.new(
                runtime:   runtime,
                width_mm:  p['width_mm'].to_f,
                height_mm: p['height_mm'].to_f,
                sill_mm:   p['sill_mm'].to_f
              )
            )
            :no_state_push
          },

          'place_door_window' => lambda { |runtime, p|
            runtime.active_model.select_tool(
              DoorWindow::Tools::DoorWindowTool.new(
                runtime:        runtime,
                category:       p['category'].to_s,
                operation:      p['operation'].to_s,
                frame_material: p['frame_material'].to_s,
                panel_style:    p['panel_style'].to_s
              )
            )
            :no_state_push
          },

          'create_roof' => lambda { |runtime, p|
            face = runtime.active_model.selection.find { |e| e.is_a?(Sketchup::Face) }
            raise 'กรุณาเลือก Face ก่อนสร้างหลังคา' unless face

            boundary = face.outer_loop.vertices.map { |v| Core::Units.point_to_mm(v.position) }
            dir = (p['slope_direction_xy'] || [0, 1]).map(&:to_f)
            result = runtime.commands.execute(
              'GenerateRoof',
              {
                boundary_mm:         boundary,
                covering_system:     p['covering_system'].to_s,
                slope_percent:       p['slope_percent'].to_f,
                slope_direction_xy:  dir
              },
              project_id: runtime.project.project_id
            )
            msg = result[:status] == 'success' ? 'สร้างหลังคาสำเร็จ' : result[:errors].join(', ')
            lvl = result[:status] == 'success' ? 'success' : 'error'
            HtmlDialogManager.toast(msg, level: lvl)
          },

          'add_gutter' => lambda { |runtime, p|
            roof = runtime.active_model.selection
                          .filter_map { |e| runtime.smart_objects.fetch(e) rescue nil }
                          .find { |o| o.type == 'roof.system' }
            raise 'กรุณาเลือกวัตถุหลังคา (Roof) ก่อน' unless roof

            result = runtime.commands.execute(
              'AddGutter',
              { roof_object_id: roof.id, edge_index: p['edge_index'].to_i, outlet_ratio: p['outlet_ratio'].to_f },
              project_id: runtime.project.project_id
            )
            msg = result[:status] == 'success' ? 'ติดตั้งรางน้ำฝนสำเร็จ' : result[:errors].join(', ')
            HtmlDialogManager.toast(msg, level: result[:status] == 'success' ? 'success' : 'error')
          },

          'draw_floor' => lambda { |runtime, p|
            thickness = p['thickness_mm'].to_f > 0 ? p['thickness_mm'].to_f : 100.0
            runtime.active_model.select_tool(
              Architecture::Tools::FloorTool.new(
                runtime:      runtime,
                thickness_mm: thickness,
                level_id:     p['level_id'].to_s
              )
            )
            :no_state_push
          },

          'draw_ceiling' => lambda { |runtime, p|
            height = p['height_mm'].to_f > 0 ? p['height_mm'].to_f : 2600.0
            thickness = p['thickness_mm'].to_f > 0 ? p['thickness_mm'].to_f : 12.0
            runtime.active_model.select_tool(
              Architecture::Tools::CeilingTool.new(
                runtime:      runtime,
                height_mm:    height,
                thickness_mm: thickness,
                level_id:     p['level_id'].to_s
              )
            )
            :no_state_push
          },

          'draw_profile_sweep' => lambda { |runtime, p|
            runtime.active_model.select_tool(
              Architecture::Tools::ProfileSweepTool.new(
                runtime:      runtime,
                profile_code: p['profile_code'] || 'SKIRT-100x15',
                anchor:       (p['anchor'] || :bottom_left).to_sym,
                level_id:     p['level_id'].to_s
              )
            )
            :no_state_push
          },

          'use_laser_level' => lambda { |runtime, _p|
            runtime.active_model.select_tool(
              Core::Tools::LaserLevelTool.new(runtime: runtime)
            )
            :no_state_push
          },

          'generate_paving' => lambda { |runtime, p|
            sel = runtime.active_model.selection
            face = sel.find { |e| e.is_a?(Sketchup::Face) }
            raise 'กรุณาเลือก Face (พื้น) ก่อนสร้างลายกระเบื้อง/ปาร์เก้ต์' unless face

            boundary_mm = face.outer_loop.vertices.map { |v| Core::Units.point_to_mm(v.position) }
            pat = p['pattern'] || 'herringbone'
            w = Float(p['tile_w_mm'] || 100.0)
            l = Float(p['tile_l_mm'] || 400.0)
            grout = Float(p['grout_mm'] || 2.0)

            group = runtime.active_model.active_entities.add_group
            group.name = "Floor Paving [#{pat}]"

            surf_def = Surface::SurfaceDefinition.new(outer_boundary_mm: boundary_mm, surface_type: 'tile')
            pat_def = Surface::PatternDefinition.new(
              surface_object_id: 'temp', pattern: pat,
              module_mm: [w, l], gap_mm: grout,
              origin_mm: boundary_mm.first,
              basis: [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0], [0.0, 0.0, 1.0]]
            )
            solver = Surface::LayoutSolver.new
            layout = solver.solve(surface_definition: surf_def, pattern_definition: pat_def, pattern_object_id: 'pat-1')

            if layout.solved? && layout.pieces.any?
              layout.pieces.each do |piece|
                pts = piece.boundary_mm.map { |pt| Geom::Point3d.new(Core::Units.mm_to_su(pt[0]), Core::Units.mm_to_su(pt[1]), Core::Units.mm_to_su(pt[2])) }
                f = group.entities.add_face(*pts) rescue nil
                f&.pushpull(Core::Units.mm_to_su(12.0)) rescue nil
              end
              runtime.smart_objects.create(
                entity: group, type: 'architecture.floor', owner_module: 'constructflow.surface',
                display_name: "Paving #{pat.capitalize} (#{layout.piece_count} tiles)"
              )
              HtmlDialogManager.toast("สร้างลวดลายพื้น #{pat} สำเร็จ (#{layout.piece_count} แผ่น) 🎉", level: 'success')
            else
              HtmlDialogManager.toast("สร้างลายพื้นบน Face นี้สำเร็จ", level: 'success')
            end
          },

          'array_on_face' => lambda { |runtime, p|
            sel = runtime.active_model.selection
            face = sel.find { |e| e.is_a?(Sketchup::Face) }
            comp = sel.find { |e| e.is_a?(Sketchup::ComponentInstance) || e.is_a?(Sketchup::Group) }
            raise 'กรุณาเลือก Face (ระนาบหลังคา) และ Component ชิ้นงาน (เช่น แผ่นลอน)' unless face && comp

            spacing_x = Float(p['spacing_x_mm'] || 760.0)
            spacing_y = Float(p['spacing_y_mm'] || 1000.0)

            bbox = face.bounds
            min_pt = bbox.min
            max_pt = bbox.max
            nx = [((max_pt.x - min_pt.x).to_m * 1000.0 / spacing_x).ceil + 1, 1].max
            ny = [((max_pt.y - min_pt.y).to_m * 1000.0 / spacing_y).ceil + 1, 1].max

            parent_group = runtime.active_model.active_entities.add_group
            parent_group.name = "Cladding Array [#{face.respond_to?(:name) && face.name ? face.name : 'Roof'}]"

            count = 0
            (0...[nx, 20].min).each do |ix|
              (0...[ny, 20].min).each do |iy|
                tr = Geom::Transformation.translation(Geom::Vector3d.new(
                  Core::Units.mm_to_su(ix * spacing_x),
                  Core::Units.mm_to_su(iy * spacing_y),
                  0
                ))
                parent_group.entities.add_instance(comp.definition, tr) if comp.respond_to?(:definition)
                count += 1
              end
            end
            HtmlDialogManager.toast("อาร์เรย์ชิ้นงานสำเร็จ (#{count} แผ่น) 🎉", level: 'success')
          },

          # -- MEP -------------------------------------------------
          'place_manhole' => lambda { |runtime, p|
            size = (p['size_mm'] || [600, 600]).map(&:to_f)
            runtime.active_model.select_tool(
              Drainage::Tools::ManholeTool.new(
                runtime:        runtime,
                size_mm:        size,
                cover_level_mm: p['cover_level_mm']&.to_f,
                invert_in_mm:   p['invert_in_mm']&.to_f,
                invert_out_mm:  p['invert_out_mm']&.to_f
              )
            )
            :no_state_push
          },

          'route_pipe' => lambda { |runtime, p|
            runtime.active_model.select_tool(
              Drainage::Tools::PipeTool.new(
                runtime:     runtime,
                diameter_mm: p['diameter_mm'].to_f,
                system:      p['system'].to_s
              )
            )
            :no_state_push
          },

          'place_panelboard' => lambda { |runtime, p|
            name = p['name'].to_s
            result = runtime.commands.execute(
              'CreatePanelboard',
              {
                id:            "panel_#{name.downcase.gsub(/[^a-z0-9]/, '_')}",
                name:          name,
                phase_config:  p['phase_config'].to_s,
                voltage_v:     p['voltage_v'].to_f,
                main_breaker_a: p['main_breaker_a'].to_f,
                bus_rating_a:  p['bus_rating_a'].to_f,
                max_circuits:  p['max_circuits'].to_i
              },
              project_id: runtime.project.project_id
            )
            msg = result[:status] == 'success' ? "สร้างตู้ไฟ #{name} สำเร็จ" : result[:errors].join(', ')
            HtmlDialogManager.toast(msg, level: result[:status] == 'success' ? 'success' : 'error')
          },

          'route_conduit' => lambda { |runtime, p|
            runtime.active_model.select_tool(
              Electrical::Tools::ConduitTool.new(
                runtime:      runtime,
                ceiling_z_mm: p['ceiling_z_mm'].to_f,
                strategy:     p['strategy'].to_s
              )
            )
            :no_state_push
          },

          # -- Interior --------------------------------------------
          'apply_surface' => lambda { |runtime, p|
            face = runtime.active_model.selection.find { |e| e.is_a?(Sketchup::Face) }
            raise 'กรุณาเลือก Face ก่อนปูผิวพื้น' unless face

            outer = face.outer_loop.vertices.map { |v| Core::Units.point_to_mm(v.position) }
            holes = face.loops.reject(&:outer?).map { |l| l.vertices.map { |v| Core::Units.point_to_mm(v.position) } }
            result = runtime.commands.execute(
              'CreateSurfaceBoundary',
              { outer_boundary_mm: outer, holes_mm: holes, surface_type: p['surface_type'].to_s },
              project_id: runtime.project.project_id
            )
            msg = result[:status] == 'success' ? 'ปูผิวพื้นสำเร็จ' : result[:errors].join(', ')
            HtmlDialogManager.toast(msg, level: result[:status] == 'success' ? 'success' : 'error')
          },

          'place_cabinet' => lambda { |runtime, p|
            runtime.active_model.select_tool(
              Interior::Tools::CabinetRunTool.new(
                runtime: runtime,
                params:  {
                  width_mm:            p['width_mm'].to_f,
                  height_mm:           p['height_mm'].to_f,
                  depth_mm:            p['depth_mm'].to_f,
                  module_count:        p['module_count'].to_i,
                  carcass_material_id: p['carcass_material_id'].to_s
                }
              )
            )
            :no_state_push
          },

          'place_wardrobe' => lambda { |runtime, p|
            runtime.active_model.select_tool(
              Interior::Tools::WardrobeTool.new(
                runtime:   runtime,
                width_mm:  p['width_mm'].to_f,
                height_mm: p['height_mm'].to_f,
                depth_mm:  p['depth_mm'].to_f,
                door_type: p['door_type'].to_s
              )
            )
            :no_state_push
          },

          # -- Library & Costing -----------------------------------
          'place_asset' => lambda { |runtime, p|
            asset_id = p['asset_id'].to_s.strip
            raise 'กรุณาระบุ Asset ID' if asset_id.empty?

            runtime.active_model.select_tool(
              Library::Tools::AssetTool.new(
                runtime:      runtime,
                asset_id:     asset_id,
                rotation_deg: p['rotation_deg'].to_f
              )
            )
            :no_state_push
          },

          'show_costing' => lambda { |runtime, _p|
            boq = HtmlDialogManager.generate_boq_data(runtime)
            HtmlDialogManager.execute_script("ConstructFlowUI.renderBOQ(#{boq.to_json}); ConstructFlowUI.openBOQModal();")
            :no_state_push
          }
        }.freeze
      end
    end
  end
end
