# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      module Tools
        class ColumnTool
          def initialize(runtime:, section_mm:, base_level_id:, top_level_id:,
                         base_offset_mm: 0, top_offset_mm: 0, explicit_height_mm: 2800)
            @runtime = runtime
            @section_mm = section_mm
            @base_level_id = base_level_id.to_s
            @top_level_id = top_level_id.to_s
            @base_offset_mm = Float(base_offset_mm)
            @top_offset_mm = Float(top_offset_mm)
            @explicit_height_mm = Float(explicit_height_mm)
            @input_point = Sketchup::InputPoint.new
          end

          def activate
            Sketchup.set_status_text('ConstructFlow เสาโครงสร้าง: คลิกตำแหน่งกึ่งกลางเพื่อวางเสา (Esc เพื่อยกเลิก)', SB_PROMPT)
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            point_mm = Core::Units.point_to_mm(@input_point.position)
            input = {
              location_mm: point_mm,
              section_mm: @section_mm,
              base_offset_mm: @base_offset_mm,
              top_offset_mm: @top_offset_mm
            }
            input[:base_level_id] = @base_level_id unless @base_level_id.empty?
            input[:top_level_id] = @top_level_id unless @top_level_id.empty?
            if @top_level_id.empty?
              input[:base_elevation_mm] = point_mm[2] if @base_level_id.empty?
              input[:top_elevation_mm] = (input[:base_elevation_mm] || point_mm[2]) + @explicit_height_mm
            end

            result = @runtime.commands.execute(
              'CreateColumn', input, project_id: @runtime.project.project_id
            )
            if result[:status] == 'success'
              view.invalidate
              Sketchup.set_status_text('Column placed. Click again or Esc to finish.', SB_PROMPT)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          rescue StandardError => error
            UI.messagebox("ConstructFlow Structure error: #{error.message}")
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end
        end
      end
    end
  end
end
