# frozen_string_literal: true

require_relative '../../../core/ghost_preview'
require_relative '../../../core/units'

module JiraNot
  module ConstructFlow
    module Electrical
      module Tools
        class ConduitTool
          def initialize(runtime:, ceiling_z_mm: 2600.0, strategy: 'ceiling_first')
            @runtime = runtime
            @ceiling_z_mm = Float(ceiling_z_mm)
            @strategy = strategy.to_s
            @input_point = Sketchup::InputPoint.new
            @start_point = nil
          end

          def activate
            Sketchup.set_status_text(
              "ConstructFlow ท่อร้อยสายไฟ: คลิกจุดเริ่มต้น (Start Point) บนแบบ • Esc เพื่อยกเลิก",
              SB_PROMPT
            )
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?

            if @start_point && @input_point.valid?
              mesh = Core::GhostPreview.build_conduit_mesh(@start_point, @input_point.position, @ceiling_z_mm)
              if mesh
                Core::GhostPreview.render_ghost(
                  view,
                  mesh,
                  face_color: [243, 156, 18, 80],
                  line_color: [211, 84, 0],
                  label: "แนวท่อร้อยสายไฟฟ้า (ระดับฝ้า #{@ceiling_z_mm.to_i} mm) - คลิกจุดสิ้นสุด"
                )
              end
            elsif @input_point.valid? && view.respond_to?(:draw_text)
              screen = view.respond_to?(:screen_coords) ? view.screen_coords(@input_point.position) : @input_point.position
              view.draw_text(screen, "คลิกจุดเริ่มต้นแนวท่อร้อยสายไฟ")
            end
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            if @start_point.nil?
              @start_point = @input_point.position
              Sketchup.set_status_text('คลิกจุดสิ้นสุด (End Point) ของแนวท่อร้อยสายไฟ', SB_PROMPT)
              view.invalidate
              return
            end

            start_pt_mm = Core::Units.point_to_mm(@start_point)
            end_pt_mm   = Core::Units.point_to_mm(@input_point.position)

            result = @runtime.commands.execute(
              'CreateConduitRoute',
              {
                start_point: start_pt_mm,
                end_point: end_pt_mm,
                strategy: @strategy,
                ceiling_z_mm: @ceiling_z_mm
              },
              project_id: @runtime.project.project_id
            )

            if result[:status] == 'success' || result[:conduit_object_id]
              @runtime.active_model.select_tool(nil)
            else
              UI.messagebox(result[:errors]&.join("\n") || 'เกิดข้อผิดพลาดในการสร้างแนวท่อร้อยสาย')
              @start_point = nil
            end
          rescue StandardError => e
            UI.messagebox("ConstructFlow Conduit error: #{e.message}")
            @start_point = nil
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            bounds.add(@start_point) if defined?(@start_point) && @start_point
            bounds.add(@input_point.position) if @input_point&.valid?
            bounds
          end

          def deactivate(view)
            @start_point = nil if defined?(@start_point)
            view.invalidate if view
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end
        end
      end
    end
  end
end
