# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Tools
        class CurtainWallTool
          def self.modify_selected(model = Sketchup.active_model)
            repo = CurtainWallRepository.new
            selected_group = model.selection.find { |e| e.is_a?(Sketchup::Group) && repo.is_curtain_wall?(e) }
            
            unless selected_group
              UI.messagebox('กรุณาเลือกวัตถุผนังกระจก/ระแนง (Curtain Wall / Lattice) ก่อนทำการแก้ไข')
              return false
            end
            
            edit_curtain_wall(selected_group, model)
          end

          def self.edit_curtain_wall(group, model = Sketchup.active_model)
            repo = CurtainWallRepository.new
            current_def = repo.load(group)
            unless current_def
              UI.messagebox('ไม่พบข้อมูลการตั้งค่าของผนังกระจก/ระแนงนี้')
              return false
            end

            prompts = [
              'ระยะห่างเสากรอบแนวตั้ง (เมตร m เช่น 1.20):',
              'ระยะห่างคานกรอบแนวนอน/ระแนง (เมตร m เช่น 0.60):',
              'ความกว้างกรอบอลูมิเนียม (เมตร m เช่น 0.05):',
              'ความลึกกรอบอลูมิเนียม (เมตร m เช่น 0.10):',
              'รูปแบบแผ่นลูกฟัก (Infill Type):',
              'องศาเอียงเกล็ด/ระแนง (Louver Angle deg):',
              'ความหนากระจก/แผ่นไม้ (เมตร m เช่น 0.006):'
            ]
            defaults = [
              (current_def.grid_width_mm / 1000.0).round(2).to_s,
              (current_def.grid_height_mm / 1000.0).round(2).to_s,
              (current_def.mullion_width_mm / 1000.0).round(3).to_s,
              (current_def.mullion_depth_mm / 1000.0).round(3).to_s,
              current_def.infill_type.to_s,
              current_def.louver_angle_deg.round.to_s,
              (current_def.infill_thickness_mm / 1000.0).round(3).to_s
            ]
            list = ['', '', '', '', 'glass|louver|slat|open|solid', '', '']

            results = UI.inputbox(prompts, defaults, list, 'ตั้งค่าแก้ไขผนังกระจก/ระแนง [Edit Curtain Wall]')
            return false unless results

            grid_w = results[0].to_f
            grid_h = results[1].to_f
            m_w = results[2].to_f
            m_d = results[3].to_f
            infill = results[4].to_sym
            louver_angle = results[5].to_f
            thickness = results[6].to_f

            new_def = CurtainWallDefinition.new(
              boundary_mm: current_def.boundary_mm,
              grid_width_mm: grid_w > 0 ? grid_w : current_def.grid_width_mm,
              grid_height_mm: grid_h > 0 ? grid_h : current_def.grid_height_mm,
              mullion_width_mm: m_w > 0 ? m_w : current_def.mullion_width_mm,
              mullion_depth_mm: m_d > 0 ? m_d : current_def.mullion_depth_mm,
              transom_width_mm: m_w > 0 ? m_w : current_def.mullion_width_mm,
              transom_depth_mm: m_d > 0 ? m_d : current_def.mullion_depth_mm,
              infill_type: infill,
              louver_angle_deg: louver_angle,
              infill_thickness_mm: thickness > 0 ? thickness : current_def.infill_thickness_mm
            )

            model.start_operation('Modify Curtain Wall', true)
        begin
            geom = CurtainWallGeometry.new(new_def)
            geom.rebuild(group, new_def)
        rescue => e
          model.abort_operation if model.respond_to?(:abort_operation)
          raise e
        end
            model.commit_operation
            true
          end

          def activate
            repo = CurtainWallRepository.new
            model = Sketchup.active_model
            selected = model.selection.find { |e| e.is_a?(Sketchup::Group) && repo.is_curtain_wall?(e) }
            if selected
              self.class.edit_curtain_wall(selected, model)
              model.select_tool(nil)
              return
            end

            Sketchup.status_text = 'คลิกเลือก Face เพื่อสร้างผนังกระจก / แผงระแนง / Louver บานเกล็ด [CW]'
          end
          
          def onLButtonDown(flags, x, y, view)
            ph = view.pick_helper
            ph.do_pick(x, y)
            
            repo = CurtainWallRepository.new
            model = Sketchup.active_model
            
            picked_group = ph.path ? ph.path.reverse.find { |e| e.is_a?(Sketchup::Group) && repo.is_curtain_wall?(e) } : nil
            if picked_group
              self.class.edit_curtain_wall(picked_group, model)
              model.select_tool(nil)
              return
            end

            face = ph.picked_face
            if face
              create_curtain_wall(face)
              model.select_tool(nil)
            else
              UI.beep
            end
          end
          
          private
          
          def create_curtain_wall(face)
            model = Sketchup.active_model
            
            prompts = [
              'ระยะห่างเสากรอบแนวตั้ง (Mullion Spacing mm):',
              'ระยะห่างคานกรอบแนวนอน/ระแนง (Transom/Slat Spacing mm):',
              'ความกว้างกรอบอลูมิเนียม (Mullion Width mm):',
              'ความลึกกรอบอลูมิเนียม (Mullion Depth mm):',
              'รูปแบบแผ่นลูกฟัก (Infill Type):',
              'องศาเอียงเกล็ด/ระแนง (Louver Angle deg):',
              'ความหนากระจก/แผ่นไม้ (Thickness mm):'
            ]
            defaults = ['1000', '1200', '50', '100', 'glass', '0', '8']
            list = ['', '', '', '', 'glass|louver|slat|open|solid', '', '']

            results = UI.inputbox(prompts, defaults, list, 'สร้างผนังกระจก / แผงระแนง [Curtain Wall & Lattice]')
            return unless results

            grid_w = results[0].to_f
            grid_h = results[1].to_f
            m_w = results[2].to_f
            m_d = results[3].to_f
            infill = results[4].to_sym
            louver_angle = results[5].to_f
            thickness = results[6].to_f

            boundary = face.outer_loop.vertices.map { |v| v.position.to_a.map { |coord| coord.to_mm } }

            model.start_operation('Generate Curtain Wall', true)
        begin

            definition = CurtainWallDefinition.new(
              boundary_mm: boundary,
              grid_width_mm: grid_w > 0 ? grid_w : 1000.0,
              grid_height_mm: grid_h > 0 ? grid_h : 1200.0,
              mullion_width_mm: m_w > 0 ? m_w : 50.0,
              mullion_depth_mm: m_d > 0 ? m_d : 100.0,
              transom_width_mm: m_w > 0 ? m_w : 50.0,
              transom_depth_mm: m_d > 0 ? m_d : 100.0,
              infill_type: infill,
              louver_angle_deg: louver_angle,
              infill_thickness_mm: thickness > 0 ? thickness : 8.0
            )

            geom = CurtainWallGeometry.new(definition)
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
