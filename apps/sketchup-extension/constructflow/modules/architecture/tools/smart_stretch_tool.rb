# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Tools
        # Interactive Viewport Tool for Non-Distort Smart Stretch (9-Slice)
        class SmartStretchTool
          def self.stretch_selected(model, options = {})
            Core::SmartStretchEngine.stretch_selection(model, options)
          end

          def initialize(runtime: nil)
            @runtime = runtime
            @selected_entity = nil
          end

          def activate
            update_status
          end

          def deactivate(view)
            view.invalidate if view
          end

          def getExtents
            bb = Geom::BoundingBox.new
            if @selected_entity&.bounds
              bb.add(@selected_entity.bounds)
            end
            bb
          end

          def onLButtonDown(flags, x, y, view)
            ph = view.pick_helper
            ph.do_pick(x, y)
            best = ph.best_picked

            # Walk up to component or group
            ent = best
            while ent && !ent.is_a?(Sketchup::Group) && !ent.is_a?(Sketchup::ComponentInstance) && ent.respond_to?(:parent)
              ent = ent.parent.is_a?(Sketchup::ComponentDefinition) ? ent.parent.instances.first : nil
            end

            if ent && (ent.is_a?(Sketchup::Group) || ent.is_a?(Sketchup::ComponentInstance))
              @selected_entity = ent
              view.model.selection.clear
              view.model.selection.add(ent)
              prompt_for_dimensions(view.model, ent)
            else
              UI.messagebox('กรุณาคลิกเลือก Group หรือ Component (ประตู/หน้าต่าง/เฟอร์นิเจอร์) ที่ต้องการยืดสเกล')
            end
          end

          def onUserText(text, view)
            # Parse VCB input: e.g. "1200, 2200" or "1200"
            parts = text.split(',').map(&:strip)
            w = parts[0] ? parts[0].to_f : nil
            h = parts[1] ? parts[1].to_f : nil

            model = view.model
            ent = model.selection.find { |e| e.is_a?(Sketchup::Group) || e.is_a?(Sketchup::ComponentInstance) }
            if ent && (w || h)
              opts = { target_width_mm: w, target_height_mm: h }
              Core::SmartStretchEngine.new(ent, opts).execute(model)
              Sketchup.status_text = "ยืดสเกลสำเร็จ: กว้าง #{w || 'เดิม'} mm, สูง #{h || 'เดิม'} mm (ขอบเฟรมไม่เพี้ยน)"
            end
          end

          private

          def update_status
            Sketchup.status_text = 'คลิกเลือกประตู/หน้าต่าง/ตู้ ที่ต้องการยืดขยาย หรือพิมพ์ความกว้าง,ความสูง (mm) ในช่อง VCB'
          end

          def prompt_for_dimensions(model, ent)
            bb = ent.bounds
            cur_w_m = (Core::Units.su_to_mm(bb.max.x - bb.min.x) / 1000.0).round(3)
            cur_h_m = (Core::Units.su_to_mm(bb.max.z - bb.min.z) / 1000.0).round(3)

            prompts = [
              "ความกว้างใหม่ (เมตร m) [ปัจจุบัน: #{cur_w_m} ม.]:",
              "ความสูงใหม่ (เมตร m) [ปัจจุบัน: #{cur_h_m} ม.]:",
              'ขนาดขอบเฟรมที่ไม่ให้เพี้ยน (เมตร m เช่น 0.05 ม.):'
            ]
            defaults = [cur_w_m.to_s, cur_h_m.to_s, '0.05']

            res = UI.inputbox(prompts, defaults, 'ConstructFlow - ยืดสเกลขอบไม่เพี้ยน (เมตร) [9-Slice Smart Stretch]')
            if res
              target_w = res[0].to_f
              target_h = res[1].to_f
              margin = res[2].to_f

              opts = {
                target_width_m: target_w,
                target_height_m: target_h,
                frame_margin_m: margin
              }
              Core::SmartStretchEngine.new(ent, opts).execute(model)
              UI.messagebox("ยืดขยายขนาดวัตถุสำเร็จ!\nความกว้าง: #{cur_w_m} ➔ #{target_w} ม.\nความสูง: #{cur_h_m} ➔ #{target_h} ม.\nขอบเฟรมคงที่: #{margin} ม.")
            end
          end
        end
      end
    end
  end
end
