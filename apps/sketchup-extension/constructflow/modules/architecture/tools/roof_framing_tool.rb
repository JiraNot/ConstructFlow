# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Tools
        class RoofFramingTool
          def self.modify_selected(model = Sketchup.active_model)
            repo = RoofFramingRepository.new
            selected_group = model.selection.find { |e| e.is_a?(Sketchup::Group) && repo.is_roof_framing?(e) }
            
            unless selected_group
              UI.messagebox('กรุณาเลือกวัตถุโครงสร้างหลังคาเหล็ก (Steel Roof Framing) ก่อนทำการแก้ไข')
              return false
            end
            
            edit_roof_framing(selected_group, model)
          end

          def self.edit_roof_framing(group, model = Sketchup.active_model)
            repo = RoofFramingRepository.new
            current_def = repo.load(group)
            unless current_def
              UI.messagebox('ไม่พบข้อมูลการตั้งค่าของโครงสร้างหลังคานี้')
              return false
            end

            prompts = [
              'องศาความชันหลังคา (Pitch deg):',
              'ระยะห่างจันทัน/โครงถัก (เมตร m เช่น 1.20):',
              'ระยะห่างแปเหล็ก (เมตร m เช่น 1.00):',
              'ระยะยื่นชายคา (เมตร m เช่น 0.80):',
              'รูปแบบหลังคา (Type):'
            ]
            defaults = [
              current_def.pitch_degrees.to_s,
              (current_def.truss_spacing_mm / 1000.0).round(2).to_s,
              (current_def.purlin_spacing_mm / 1000.0).round(2).to_s,
              (current_def.overhang_mm / 1000.0).round(2).to_s,
              current_def.type.to_s
            ]
            list = ['', '', '', '', 'gable|shed']

            results = UI.inputbox(prompts, defaults, list, 'ตั้งค่าแก้ไขโครงสร้างเหล็กหลังคา [Edit Roof Framing]')
            return false unless results

            pitch = results[0].to_f
            truss_spacing = results[1].to_f < 50.0 ? results[1].to_f * 1000.0 : results[1].to_f
            purlin_spacing = results[2].to_f < 50.0 ? results[2].to_f * 1000.0 : results[2].to_f
            overhang = results[3].to_f < 50.0 ? results[3].to_f * 1000.0 : results[3].to_f
            roof_type = results[4].to_sym

            new_def = RoofFramingDefinition.new(
              boundary_mm: current_def.boundary_mm,
              pitch_degrees: pitch > 0 ? pitch : current_def.pitch_degrees,
              truss_spacing_mm: truss_spacing > 0 ? truss_spacing : current_def.truss_spacing_mm,
              purlin_spacing_mm: purlin_spacing > 0 ? purlin_spacing : current_def.purlin_spacing_mm,
              overhang_mm: overhang >= 0 ? overhang : current_def.overhang_mm,
              type: roof_type
            )

            model.start_operation('Modify Roof Steel Framing', true)
        begin
            geom = RoofFramingGeometry.new(new_def)
            geom.rebuild(group, new_def)
        rescue => e
          model.abort_operation if model.respond_to?(:abort_operation)
          raise e
        end
            model.commit_operation
            true
          end

          def activate
            repo = RoofFramingRepository.new
            model = Sketchup.active_model
            selected = model.selection.find { |e| e.is_a?(Sketchup::Group) && repo.is_roof_framing?(e) }
            if selected
              self.class.edit_roof_framing(selected, model)
              model.select_tool(nil)
              return
            end

            Sketchup.status_text = 'คลิกเลือก Face เพื่อสร้างโครงหลังคาเหล็ก หรือคลิกที่โครงเหล็กเดิมเพื่อแก้ไข [RF]'
          end
          
          def onLButtonDown(flags, x, y, view)
            ph = view.pick_helper
            ph.do_pick(x, y)
            
            # Check if clicked on existing roof framing group
            repo = RoofFramingRepository.new
            model = Sketchup.active_model
            
            picked_group = ph.path ? ph.path.reverse.find { |e| e.is_a?(Sketchup::Group) && repo.is_roof_framing?(e) } : nil
            if picked_group
              self.class.edit_roof_framing(picked_group, model)
              model.select_tool(nil)
              return
            end

            face = ph.picked_face
            if face
              generate_roof(face)
              model.select_tool(nil)
            else
              UI.beep
            end
          end
          
          private
          
          def generate_roof(face)
            model = Sketchup.active_model
            
            prompts = [
              'องศาความชันหลังคา (Pitch deg):',
              'ระยะห่างจันทัน/โครงถัก (Truss Spacing mm):',
              'ระยะห่างแปเหล็ก C-Channel (Purlin Spacing mm):',
              'ระยะยื่นชายคา (Overhang mm):',
              'รูปแบบหลังคา (Type):'
            ]
            defaults = ['30.0', '1000', '300', '600', 'gable']
            list = ['', '', '', '', 'gable|shed']

            results = UI.inputbox(prompts, defaults, list, 'สร้างโครงสร้างเหล็กหลังคา [Steel Roof Framing]')
            return unless results

            pitch = results[0].to_f
            truss_spacing = results[1].to_f < 50.0 ? results[1].to_f * 1000.0 : results[1].to_f
            purlin_spacing = results[2].to_f < 50.0 ? results[2].to_f * 1000.0 : results[2].to_f
            overhang = results[3].to_f < 50.0 ? results[3].to_f * 1000.0 : results[3].to_f
            roof_type = results[4].to_sym

            model.start_operation('Generate Roof Framing', true)
        begin
            
            boundary = face.outer_loop.vertices.map { |v| v.position.to_a.map { |coord| coord.to_mm } }
            
            definition = RoofFramingDefinition.new(
              boundary_mm: boundary,
              pitch_degrees: pitch > 0 ? pitch : 30.0,
              truss_spacing_mm: truss_spacing > 0 ? truss_spacing : 1000.0,
              purlin_spacing_mm: purlin_spacing > 0 ? purlin_spacing : 300.0,
              overhang_mm: overhang >= 0 ? overhang : 600.0,
              type: roof_type
            )
            
            geom = RoofFramingGeometry.new(definition)
            group = geom.generate(model.active_entities)
            
        rescue => e
          model.abort_operation if model.respond_to?(:abort_operation)
          raise e
        end
            model.commit_operation
          end
        end
      end
    end
  end
end
