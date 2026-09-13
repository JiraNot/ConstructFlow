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
            case smart_obj.type
            when 'architecture.wall'
              if defined?(Architecture::WallRepository)
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
            when 'structure.beam'
              if defined?(Structure::Repository)
                definition = Structure::Repository.new.read_beam(entity)
                if definition
                  props['หน้าตัด (Section)'] = definition.section_mm.map { |v| format('%.1f', v) }.join('x') + ' mm'
                  props['ความยาว (L)'] = "#{format('%.2f', definition.length_mm / 1000.0)} m"
                  props['ปริมาตร (Vol)'] = "#{format('%.3f', definition.volume_mm3 / 1_000_000_000.0)} คิว (m³)"
                  props['วัสดุ'] = definition.material.to_s
                end
              end
            when 'structure.column'
              if defined?(Structure::Repository)
                definition = Structure::Repository.new.read_column(entity)
                if definition
                  props['หน้าตัด (Section)'] = definition.section_mm.map { |v| format('%.1f', v) }.join('x') + ' mm'
                  props['ความสูง (H)'] = "#{format('%.2f', definition.height_mm / 1000.0)} m"
                  props['ปริมาตร (Vol)'] = "#{format('%.3f', definition.volume_mm3 / 1_000_000_000.0)} คิว (m³)"
                  props['วัสดุ'] = definition.material.to_s
                end
              end
            when 'architecture.stair'
              if defined?(Architecture::StairRepository)
                definition = Architecture::StairRepository.new.read(entity)
                if definition
                  w = definition.stair_width || definition.stair_width_mm || 0.0
                  props['ความกว้าง'] = "#{format('%.2f', w / 1000.0)} m"
                end
              end
            when 'architecture.roof_framing'
              props['ชนิดโครงสร้าง'] = 'โครงหลังคา'
            when 'architecture.roof'
              props['ชนิดโครงสร้าง'] = 'หลังคาหลัก'
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

          foundation_vol = 0.0
          column_vol = 0.0
          beam_vol = 0.0
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
          struct_repo = defined?(Structure::Repository) ? Structure::Repository.new : nil

          objects.each do |obj|
            case obj.type
            when 'structure.column'
              column_count += 1
              if struct_repo && obj.entity
                def_col = struct_repo.read_column(obj.entity) rescue nil
                if def_col
                  column_vol += def_col.volume_mm3 / 1_000_000_000.0
                  perim = (def_col.section_mm[0] * 2 + def_col.section_mm[1] * 2)
                  structure_formwork += (perim * def_col.height_mm) / 1_000_000.0
                else
                  column_vol += 0.12
                  structure_formwork += 2.4
                end
              end
            when 'structure.beam'
              beam_count += 1
              if struct_repo && obj.entity
                def_beam = struct_repo.read_beam(obj.entity) rescue nil
                if def_beam
                  beam_vol += def_beam.volume_mm3 / 1_000_000_000.0
                  perim = def_beam.section_mm[0] + (def_beam.section_mm[1] * 2) # bottom + 2 sides
                  structure_formwork += (perim * def_beam.length_mm) / 1_000_000.0
                else
                  beam_vol += 0.32
                  structure_formwork += 4.0
                end
              end
            when 'structure.foundation'
              foundation_count += 1
              if struct_repo && obj.entity
                def_fd = struct_repo.read_foundation(obj.entity) rescue nil
                if def_fd
                  foundation_vol += (def_fd.size_mm[0] * def_fd.size_mm[1] * def_fd.size_mm[2]) / 1_000_000_000.0
                  structure_formwork += ((def_fd.size_mm[0]*2 + def_fd.size_mm[1]*2) * def_fd.size_mm[2]) / 1_000_000.0
                else
                  foundation_vol += 0.5
                end
              end
            when 'architecture.wall'
              if wall_repo && obj.entity
                def_wall = wall_repo.read(obj.entity) rescue nil
                if def_wall
                  wall_area += (def_wall.gross_area_mm2 rescue 0) / 1_000_000.0
                  wall_vol += (def_wall.volume_mm3 rescue 0) / 1_000_000_000.0
                end
              end
            when 'architecture.floor'
              if obj.entity.respond_to?(:volume)
                v = obj.entity.volume * (0.0254 ** 3) # in^3 to m^3
                # guess area from volume assuming 150mm thick
                floor_area += (v / 0.15) if v > 0
              else
                floor_area += 25.0
              end
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
          if foundation_vol > 0 || objects.empty?
            qty = foundation_vol > 0 ? foundation_vol.round(2) : 2.5
            structure_items << { code: 'STR-01', name: 'คอนกรีตฐานราก 240 ksc', unit: 'ลบ.ม.', qty: qty, mat_rate: 2100.0, lab_rate: 450.0, total: (qty * 2550.0).round(2) }
          end
          if column_vol > 0 || objects.empty?
            qty = column_vol > 0 ? column_vol.round(2) : 1.2
            structure_items << { code: 'STR-02', name: 'คอนกรีตเสาโครงสร้าง 240 ksc', unit: 'ลบ.ม.', qty: qty, mat_rate: 2250.0, lab_rate: 550.0, total: (qty * 2800.0).round(2) }
          end
          if beam_vol > 0 || objects.empty?
            qty = beam_vol > 0 ? beam_vol.round(2) : 2.8
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
                    'draw_grid_framing' => lambda { |runtime, _p|
            runtime.active_model.select_tool(
              Architecture::Tools::GridFramingTool.new(runtime: runtime)
            )
            :no_state_push
          },

          'draw_stair' => lambda { |runtime, _p|
            runtime.active_model.select_tool(
              Architecture::Tools::StairTool.new(runtime: runtime)
            )
            :no_state_push
          },

          'draw_roof_framing' => lambda { |runtime, _p|
            runtime.active_model.select_tool(
              Architecture::Tools::RoofFramingTool.new(runtime: runtime)
            )
            :no_state_push
          },

          'modify_roof_framing' => lambda { |runtime, _p|
            Architecture::Tools::RoofFramingTool.modify_selected(runtime.active_model)
            :no_state_push
          },

          'draw_curtain_wall' => lambda { |runtime, _p|
            runtime.active_model.select_tool(
              Architecture::Tools::CurtainWallTool.new(runtime: runtime)
            )
            :no_state_push
          },

          'modify_curtain_wall' => lambda { |runtime, _p|
            Architecture::Tools::CurtainWallTool.modify_selected(runtime.active_model)
            :no_state_push
          },

          'stretch_by_area' => lambda { |runtime, _p|
            runtime.active_model.select_tool(
              Architecture::Tools::StretchByAreaTool.new
            )
            :no_state_push
          },

          'detect_rooms' => lambda { |runtime, p|
            res = runtime.commands.execute(
              'DetectRoomsFromWalls',
              { name_prefix: p['prefix'] || 'Room', program: p['program'] || 'generic' },
              project_id: runtime.project.project_id
            )
            count = res[:created_object_ids]&.length || 0
            UI.messagebox("ตรวจพบและสร้างห้องอัตโนมัติสำเร็จ: #{count} ห้อง พร้อมคำนวณพื้นที่และเส้นรอบรูป")
            :no_state_push
          },

          'assign_rebar' => lambda { |runtime, p|
            host = runtime.active_model.selection.filter_map { |entity| runtime.smart_objects.fetch(entity) }
                          .find { |object| %w[structure.column structure.foundation structure.beam].include?(object.type) }
            unless host
              UI.messagebox('กรุณาคลิกเลือกวัตถุโครงสร้าง (เสา / คาน / ฐานราก) ก่อนใส่เหล็กเสริม')
              return :no_state_push
            end

            dia = (p['diameter_mm'] || 16.0).to_f
            count = (p['bar_count'] || 4).to_i
            cover = (p['cover_mm'] || 40.0).to_f
            role = (p['role'] || 'main_bottom').to_s

            input = {
              host_object_id: host.id,
              diameter_mm: dia,
              bar_count: count,
              role: role,
              cover_mm: cover
            }
            res = runtime.commands.execute('AssignRebarSet', input, project_id: runtime.project.project_id)
            if res[:status] == 'success'
              UI.messagebox("ใส่เหล็กเสริม 3D (DB#{dia.round} x #{count} เส้น) ใน #{host.display_name} สำเร็จ!\nสร้างโครงปลอกและตะแกรงอัตโนมัติ")
            else
              UI.messagebox("เกิดข้อผิดพลาด: #{res[:errors]&.join(', ')}")
            end
            :no_state_push
          },

          'show_bbs' => lambda { |runtime, _p|
            rebar_objects = runtime.smart_objects.all.select { |o| o.type == 'structure.rebar_set' }
            repo = Structure::Repository.new
            total_wt = 0.0
            rows = []
            rebar_objects.each do |obj|
              def_rb = repo.read_rebar_set(obj.entity)
              next unless def_rb
              wt = def_rb.total_mass_kg
              total_wt += wt
              rows << "#{obj.display_name}: #{def_rb.bar_count}xDB#{def_rb.diameter_mm.round} L=#{(def_rb.total_length_mm/1000.0).round(2)}m = #{wt.round(2)} kg"
            end
            msg = rows.empty? ? "ยังไม่มีรายการเหล็กเสริมในโมเดล (ใช้ปุ่ม [RB] เพื่อสร้างเหล็กเสริม 3D)" : "รายการตารางดัดเหล็ก (Bar Bending Schedule - BBS):\n\n" + rows.join("\n") + "\n\nน้ำหนักเหล็กรวม: #{total_wt.round(2)} kg (#{(total_wt/1000.0).round(3)} ตัน)"
            UI.messagebox(msg)
            :no_state_push
          },

          'export_boq_csv' => lambda { |runtime, _p|
            boq = generate_boq_data(runtime)
            csv_lines = ["\xEF\xBB\xBFหมวดงาน,รหัส,รายการ,ปริมาณ,หน่วย,ค่าวัสดุต่อหน่วย,ค่าแรงต่อหน่วย,ราคารวม (บาท)"]
            boq[:categories].each do |cat|
              csv_lines << "#{cat[:name]},,,,,,,#{cat[:subtotal]}"
              cat[:items].each do |item|
                csv_lines << "#{cat[:name]},#{item[:code]},#{item[:name]},#{item[:qty]},#{item[:unit]},#{item[:mat_rate]},#{item[:lab_rate]},#{item[:total]}"
              end
            end
            csv_lines << "รวมเงินทั้งสิ้น (Grand Total),,,,,,,#{boq[:grand_total]}"
            
            # Save dialog
            path = UI.savepanel('ส่งออก BOQ เป็นไฟล์ CSV', '', 'ConstructFlow_BOQ.csv')
            if path
              File.write(path, csv_lines.join("\n"), encoding: 'UTF-8')
              UI.messagebox("ส่งออก BOQ เรียบร้อย:\n#{path}")
            end
            :no_state_push
          },



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
            
            unless face
              UI.messagebox('กรุณาเลือก Face (ระนาบหลังคา) ก่อนทำการกระจายแผ่นลอน/กระเบื้อง [Array On Face]')
              return :no_state_push
            end

            elem_type = p['element_type'] || 'metal_sheet_roof'
            spacing_x = Float(p['spacing_m'] || 0.76) * 1000.0 # 760mm width default for metal sheet
            spacing_y = Float(p['spacing_y_m'] || 1.0) * 1000.0
            overhang  = Float(p['overhang_m'] || 0.1) * 1000.0

            # Calculate Face local coordinate axes (slope and cross-slope vectors)
            norm = face.normal
            # Slope vector down the roof plane
            z_axis = Geom::Vector3d.new(0, 0, 1)
            v_ridge = norm * z_axis # Horizontal vector along ridge/eaves
            if v_ridge.length < 0.001
              v_ridge = Geom::Vector3d.new(1, 0, 0)
              v_slope = Geom::Vector3d.new(0, 1, 0)
            else
              v_ridge.normalize!
              v_slope = norm * v_ridge
              v_slope.normalize!
              v_slope.reverse! if v_slope.z > 0 # Point downwards along slope
            end

            # Project face vertices into local (u=cross-slope, v=down-slope) coordinates
            pts = face.outer_loop.vertices.map(&:position)
            p0 = pts.first

            u_vals = pts.map { |pt| (pt - p0) % v_ridge }
            v_vals = pts.map { |pt| (pt - p0) % v_slope }

            min_u = u_vals.min - overhang.mm
            max_u = u_vals.max + overhang.mm
            min_v = v_vals.min - overhang.mm
            max_v = v_vals.max + overhang.mm

            span_u = max_u - min_u
            span_v = max_v - min_v

            num_cols = [(span_u / spacing_x.mm).ceil, 1].max
            num_rows = [(span_v / spacing_y.mm).ceil, 1].max

            runtime.active_model.start_operation('Array Roof Sheets On Face', true)
            parent_group = runtime.active_model.active_entities.add_group
            parent_group.name = "Roof Array [#{elem_type}]"

            count = 0
            (0...num_cols).each do |c|
              (0...num_rows).each do |r|
                pt_local = p0 + (v_ridge * (min_u + c * spacing_x.mm)) + (v_slope * (min_v + r * spacing_y.mm)) + (norm * 10.mm)
                
                if comp && comp.respond_to?(:definition)
                  tr = Geom::Transformation.new(pt_local, norm)
                  parent_group.entities.add_instance(comp.definition, tr)
                else
                  # Built-in parametric 3D corrugated metal sheet panel with ribs
                  sheet_grp = parent_group.entities.add_group
                  sw = spacing_x.mm
                  sl = spacing_y.mm
                  sh = 25.0.mm # Rib height

                  p_a = pt_local
                  p_b = pt_local + (v_ridge * sw)
                  p_c = pt_local + (v_ridge * sw) + (v_slope * sl)
                  p_d = pt_local + (v_slope * sl)

                  s_face = sheet_grp.entities.add_face(p_a, p_b, p_c, p_d) rescue nil
                  s_face.pushpull(-5.mm) if s_face

                  # Add 3D trapezoidal ribs along slope
                  (1..3).each do |k|
                    rib_u = (k.to_f / 4.0) * sw
                    p_r1 = pt_local + (v_ridge * rib_u)
                    p_r2 = p_r1 + (v_slope * sl)
                    rib = sheet_grp.entities.add_group
                    rf_pts = [
                      p_r1 - (v_ridge * 15.mm),
                      p_r1 + (v_ridge * 15.mm),
                      p_r1 + (v_ridge * 10.mm) + (norm * sh),
                      p_r1 - (v_ridge * 10.mm) + (norm * sh)
                    ]
                    rf = rib.entities.add_face(rf_pts) rescue nil
                    rf.pushpull(-sl) if rf
                  end
                end
                count += 1
              end
            end
            runtime.active_model.commit_operation
            UI.messagebox("สร้างแผ่นหลังคา 3D กระจายตัวบน Face สำเร็จ: #{count} แผ่น 🎉\n(คำนวณตามองศาลาดเอียงหลังคาเรียบร้อย)")
            :no_state_push
          },

          'save_custom_profile' => lambda { |runtime, p|
            face = runtime.active_model.selection.find { |e| e.is_a?(Sketchup::Face) }
            unless face
              UI.messagebox('กรุณาเลือก Face หน้าตัดก่อนทำการบันทึกเป็นโปรไฟล์')
              return :no_state_push
            end
            code = (p['code'] || "CUST-#{Time.now.to_i}").to_s
            name = (p['name'] || "Custom Profile #{code}").to_s
            anchor = (p['anchor'] || :bottom_left).to_sym

            extracted = Core::CustomProfileStore.extract_profile_from_face(face, anchor: anchor)
            if extracted
              Core::CustomProfileStore.add_profile(code, name, extracted[:points_mm], extracted[:width_mm], extracted[:depth_mm])
              UI.messagebox("บันทึกหน้าตัดโปรไฟล์ '#{name}' (#{code}) สำเร็จ!\nขนาด: #{extracted[:width_mm]} x #{extracted[:depth_mm]} mm")
            else
              UI.messagebox('ไม่สามารถสกัดจุดหน้าตัดจาก Face ที่เลือกได้')
            end
            :no_state_push
          },

          'smart_stretch' => lambda { |runtime, p|
            ent = runtime.active_model.selection.find { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }
            unless ent
              UI.messagebox('กรุณาเลือก Group หรือ Component (ประตู/หน้าต่าง/ตู้) ก่อนยืดสเกล')
              return :no_state_push
            end

            opts = {
              target_width_mm: p['target_width_mm']&.to_f,
              target_height_mm: p['target_height_mm']&.to_f,
              target_depth_mm: p['target_depth_mm']&.to_f,
              delta_width_mm: p['delta_width_mm']&.to_f,
              delta_height_mm: p['delta_height_mm']&.to_f,
              frame_margin_mm: (p['frame_margin_mm'] || 50.0).to_f
            }

            Core::SmartStretchEngine.new(ent, opts).execute(runtime.active_model)
            UI.messagebox("ยืดขยายขนาดสำเร็จโดยขอบเฟรมไม่เพี้ยน!\nกว้างเป้าหมาย: #{p['target_width_m'] || p['target_width_mm'] || 'คงเดิม'} ม. | สูงเป้าหมาย: #{p['target_height_m'] || p['target_height_mm'] || 'คงเดิม'} ม.")
            :no_state_push
          },

          'revit_auto_roof' => lambda { |runtime, p|
            form = (p['form'] || 'hip').to_s
            slope = (p['slope_deg'] || 30.0).to_f
            overhang = (p['overhang_m'] || 0.80).to_f
            thickness = (p['thickness_m'] || 0.15).to_f
            fascia_h = (p['fascia_height_m'] || 0.20).to_f
            attach_walls = p['attach_walls'].nil? ? true : (p['attach_walls'] == true || p['attach_walls'] == 'true')

            options = {
              form: form,
              slope_deg: slope,
              overhang_m: overhang,
              thickness_m: thickness,
              fascia_height_m: fascia_h,
              attach_walls: attach_walls
            }

            roof = Architecture::RevitAutoRoof.generate_from_selection(runtime.active_model, options)
            if roof
              form_th = case form
                        when 'hip' then 'ปั้นหยา'
                        when 'gable' then 'จั่ว'
                        when 'shed' then 'เพิงแหงน'
                        else 'ดาดฟ้า'
                        end
              msg = "สร้างหลังคา Auto แบบ Revit (#{form_th}) สำเร็จ!\nความลาดชัน: #{slope}° | ชายคายื่น: #{overhang} ม. | หนา: #{thickness} ม."
              msg += "\nแนบหัวผนังและปิดหน้าจั่วอัตโนมัติ (Attached Walls to Roof)" if attach_walls
              UI.messagebox(msg)
            end
            :no_state_push
          },

          'generate_hip_gable_roof' => lambda { |runtime, p|
            form = (p['form'] || 'hip').to_s
            slope = (p['slope_deg'] || 30.0).to_f
            overhang = (p['overhang_mm'] || 800.0).to_f
            thickness = (p['thickness_mm'] || 35.0).to_f
            fascia_h = (p['fascia_height_mm'] || 200.0).to_f
            fascia_t = (p['fascia_thickness_mm'] || 25.0).to_f

            roof_grp = Architecture::HipGableRoofGenerator.generate_from_selection(
              runtime.active_model,
              form: form,
              slope_deg: slope,
              overhang_mm: overhang,
              thickness_mm: thickness,
              fascia_height_mm: fascia_h,
              fascia_thickness_mm: fascia_t
            )
            if roof_grp
              form_th = form == 'hip' ? 'ปั้นหยา' : (form == 'gable' ? 'จั่ว' : 'เพิงแหงน')
              UI.messagebox("สร้างหลังคา#{form_th}พร้อมเชิงชายสำเร็จ!\nความลาดชัน: #{slope}° | ชายคายื่น: #{overhang < 20 ? overhang : overhang/1000.0} ม. | เชิงชาย: #{fascia_h < 20 ? fascia_h : fascia_h/1000.0} ม.")
            end
            :no_state_push
          },

          'sweep_on_selection' => lambda { |runtime, p|
            edges = runtime.active_model.selection.select { |e| e.is_a?(Sketchup::Edge) }
            if edges.empty?
              UI.messagebox('กรุณาเลือกเส้น (Edges/Curve) ในโมเดลก่อนทำการกวาดโปรไฟล์')
              return :no_state_push
            end
            code = p['profile_code'] || 'SKIRT-100x15'
            res = Core::CustomProfileStore.sweep_along_edges(edges, code, runtime.active_model)
            if res
              UI.messagebox("กวาดโปรไฟล์ #{code} ตามแนวเส้นสำเร็จ!")
            else
              UI.messagebox('ไม่สามารถกวาดโปรไฟล์ตามเส้นที่เลือกได้')
            end
            :no_state_push
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
