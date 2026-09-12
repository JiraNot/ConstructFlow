# frozen_string_literal: true

require_relative '../../../core/ghost_preview'
require_relative '../../../core/units'

module JiraNot
  module ConstructFlow
    module Interior
      module Tools
        class WardrobeTool
          def initialize(runtime:, width_mm: 1800.0, height_mm: 2400.0, depth_mm: 600.0, door_type: 'hinged')
            @runtime = runtime
            @width_mm = Float(width_mm)
            @height_mm = Float(height_mm)
            @depth_mm = Float(depth_mm)
            @door_type = door_type.to_s
            @input_point = Sketchup::InputPoint.new
          end

          def activate
            Sketchup.set_status_text(
              "ConstructFlow ตู้เสื้อผ้า: คลิกเพื่อวางตู้เสื้อผ้า (#{@width_mm.to_i}x#{@height_mm.to_i}x#{@depth_mm.to_i} mm - #{@door_type}) • Esc เพื่อยกเลิก",
              SB_PROMPT
            )
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?

            if @input_point.valid?
              mesh = Core::GhostPreview.build_wardrobe_mesh(
                @input_point.position,
                @width_mm,
                @height_mm,
                @depth_mm,
                @door_type
              )
              if mesh
                Core::GhostPreview.render_ghost(
                  view,
                  mesh,
                  face_color: [211, 84, 0, 75],
                  line_color: [186, 74, 0]
                )
              end
            end
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            result = @runtime.commands.execute(
              'CreateWardrobe',
              {
                origin_mm: Core::Units.point_to_mm(@input_point.position),
                width_mm: @width_mm,
                height_mm: @height_mm,
                depth_mm: @depth_mm,
                door_type: @door_type
              },
              project_id: @runtime.project.project_id
            )

            if result[:status] == 'success'
              @runtime.active_model.select_tool(nil)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          rescue StandardError => e
            UI.messagebox("ConstructFlow Wardrobe error: #{e.message}")
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end
        end
      end
    end
  end
end
