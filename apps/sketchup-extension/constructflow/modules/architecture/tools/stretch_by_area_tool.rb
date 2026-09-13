# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Tools
        class StretchByAreaTool
          def activate
            model = Sketchup.active_model
            selected_face = model.selection.find { |e| e.is_a?(Sketchup::Face) }
            if selected_face
              stretch_face(selected_face)
              model.select_tool(nil)
              return
            end

            Sketchup.status_text = 'คลิกเลือก Face เพื่อยืด/ปรับขนาดตามพื้นที่เป้าหมาย (Stretch by Target Area) [SA]'
          end

          def onLButtonDown(flags, x, y, view)
            ph = view.pick_helper
            ph.do_pick(x, y)
            face = ph.picked_face
            if face
              stretch_face(face)
              Sketchup.active_model.select_tool(nil)
            else
              UI.beep
            end
          end

          private

          def stretch_face(face)
            cur_area = StretchByTargetArea.face_area_m2(face)
            prompts = [
              'พื้นที่ปัจจุบัน (Current Area m²):',
              'พื้นที่เป้าหมายที่ต้องการ (Target Area m²):',
              'รูปแบบการยืด (Mode):'
            ]
            defaults = [
              cur_area.round(3).to_s,
              (cur_area * 1.2).round(2).to_s,
              'uniform'
            ]
            list = ['', '', 'uniform|stretch_x|stretch_y']

            results = UI.inputbox(prompts, defaults, list, 'ยืดขยายตามพื้นที่เป้าหมาย [Stretch by Area]')
            return unless results

            target_m2 = results[1].to_f
            mode = results[2].to_sym

            if target_m2 > 0
              StretchByTargetArea.apply_to_face(face, target_m2, mode: mode)
            else
              UI.messagebox('กรุณาระบุพื้นที่เป้าหมายที่มากกว่า 0')
            end
          end
        end
      end
    end
  end
end
