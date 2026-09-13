# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Tools
        # Interactive Viewport Tool for Revit-Style Auto Roof by Footprint
        class RevitAutoRoofTool
          def self.generate_roof(model = Sketchup.active_model, options = {})
            RevitAutoRoof.generate_from_selection(model, options)
          end

          def initialize(runtime: nil)
            @runtime = runtime
          end

          def activate
            update_status
          end

          def deactivate(view)
            view.invalidate if view
          end

          def getExtents
            Geom::BoundingBox.new
          end

          def onLButtonDown(flags, x, y, view)
            model = view.model
            ph = view.pick_helper
            ph.do_pick(x, y)
            picked = ph.best_picked

            if picked
              model.selection.clear
              model.selection.add(picked)
            end

            prompt_and_generate(model)
          end

          def prompt_and_generate(model)
            prompts = [
              'รูปแบบหลังคา (Form):',
              'องศาความชัน (Slope องศา deg):',
              'ระยะยื่นชายคา (เมตร m เช่น 0.80):',
              'ความหนาแผ่นมุง/โครงสร้าง (เมตร m เช่น 0.15):',
              'ความสูงไม้เชิงชาย (เมตร m เช่น 0.20):',
              'แนบหัวผนังติดหลังคา/ปิดจั่วอัตโนมัติ (Attach Walls):'
            ]
            defaults = ['hip', '30.0', '0.80', '0.15', '0.20', 'yes']
            list = ['hip|gable|shed|flat', '', '', '', '', 'yes|no']

            results = UI.inputbox(prompts, defaults, list, 'ConstructFlow - หลังคา Auto แบบ Revit (Roof by Footprint)')
            return unless results

            form = results[0].to_s
            slope = results[1].to_f
            overhang = results[2].to_f
            thickness = results[3].to_f
            fascia_h = results[4].to_f
            attach_walls = results[5].to_s.downcase == 'yes'

            options = {
              form: form,
              slope_deg: slope,
              overhang_m: overhang,
              thickness_m: thickness,
              fascia_height_m: fascia_h,
              attach_walls: attach_walls
            }

            roof = RevitAutoRoof.generate_from_selection(model, options)
            if roof
              form_th = case form
                        when 'hip' then 'ปั้นหยา'
                        when 'gable' then 'จั่ว'
                        when 'shed' then 'เพิงแหงน'
                        else 'ดาดฟ้า'
                        end
              msg = "สร้างหลังคา Auto แบบ Revit (#{form_th}) สำเร็จ!\nความลาดชัน: #{slope}° | ชายคายื่น: #{overhang} ม. | หนา: #{thickness} ม."
              msg += "\nแนบหัวผนังและปิดหน้าจั่วเรียบร้อย (Attached Walls to Roof)" if attach_walls
              UI.messagebox(msg)
            end
          end

          private

          def update_status
            Sketchup.status_text = 'คลิกเลือกแนวผนัง หรือ Face อาคารเพื่อสร้างหลังคา Auto แบบ Revit (Revit Roof by Footprint)'
          end
        end
      end
    end
  end
end
