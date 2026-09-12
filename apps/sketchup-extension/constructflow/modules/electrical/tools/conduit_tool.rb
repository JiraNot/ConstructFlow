# frozen_string_literal: true

require_relative '../../../core/ghost_preview'
require_relative '../../../core/units'
require_relative '../../../core/plan_interaction_engine'

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
            @start_input_point = nil
            @start_point = nil
            @locked_axis = nil
            @numeric_length_mm = nil
            @interaction = Core::PlanInteractionEngine.new
          end

          def activate
            @locked_axis = nil
            @numeric_length_mm = nil
            @start_point = nil
            @start_input_point = nil
            Sketchup.set_status_text(
              "ConstructFlow ท่อร้อยสายไฟ: คลิกจุดเริ่มต้น (Start Point) บนแบบ • ลูกศรล็อคแกน • พิมพ์ระยะใน VCB • Esc เพื่อยกเลิก",
              SB_PROMPT
            )
            Sketchup.set_status_text('ความยาว (Length)', SB_VCB_LABEL) if defined?(SB_VCB_LABEL)
            Sketchup.set_status_text('', SB_VCB_VALUE) if defined?(SB_VCB_VALUE)
          end

          def onMouseMove(_flags, x, y, view)
            if @start_point && @start_input_point
              @input_point.pick(view, x, y, @start_input_point)
            else
              @input_point.pick(view, x, y)
            end

            if @start_point && @input_point.valid?
              pos = constrained_position(@input_point.position)
              dist_mm = @start_point.distance(pos).to_mm
              if defined?(SB_VCB_LABEL)
                Sketchup.set_status_text('ความยาว (Length)', SB_VCB_LABEL)
                Sketchup.set_status_text(format('%.1f mm', dist_mm), SB_VCB_VALUE)
              end
            end
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?

            if @start_point && @input_point.valid?
              target = constrained_position(@input_point.position)
              mesh = Core::GhostPreview.build_conduit_mesh(@start_point, target, @ceiling_z_mm)
              if mesh
                Core::GhostPreview.render_ghost(
                  view,
                  mesh,
                  face_color: [243, 156, 18, 80],
                  line_color: [211, 84, 0],
                  label: "แนวท่อร้อยสายไฟฟ้า (ระดับฝ้า #{@ceiling_z_mm.to_i} mm) - คลิกจุดสิ้นสุด"
                )
              end

              # Axis guide line if locked
              if @locked_axis
                axis_color = @locked_axis == :red ? 'red' : (@locked_axis == :green ? 'green' : 'blue')
                view.line_width = 3
                view.drawing_color = axis_color
                view.draw(GL_LINES, [@start_point, target])
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
              @start_input_point = Sketchup::InputPoint.new(@input_point.position)
              Sketchup.set_status_text('คลิกจุดสิ้นสุด (End Point) หรือ พิมพ์ความยาวใน VCB แล้วกด Enter (ลูกศรเพื่อล็อคแกน)', SB_PROMPT)
              view.invalidate
              return
            end

            target = constrained_position(@input_point.position)
            create_conduit(@start_point, target)
          end

          def enableVCB?
            true
          end

          def onUserText(text, view)
            length_mm = @interaction.numeric_distance_mm(text)
            @numeric_length_mm = length_mm

            unless @start_point
              Sketchup.set_status_text("กำหนดความยาวแนวท่อ #{length_mm.round(1)} mm (คลิกจุดเริ่มต้นเพื่อวางท่อ)", SB_PROMPT)
              view.invalidate
              return
            end

            target = if @input_point.valid? && @start_point.distance(@input_point.position) > 0.001
                       dir = @start_point.vector_to(constrained_position(@input_point.position)).normalize
                       @start_point.offset(dir, length_mm.mm)
                     elsif @locked_axis == :green
                       @start_point.offset(Geom::Vector3d.new(0, 1, 0), length_mm.mm)
                     else
                       @start_point.offset(Geom::Vector3d.new(1, 0, 0), length_mm.mm)
                     end

            create_conduit(@start_point, target)
            view.invalidate
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end

          def onKeyDown(key, repeat, _flags, view)
            if (key == 39 || (defined?(VK_RIGHT) && key == VK_RIGHT)) && !repeat
              @locked_axis = @locked_axis == :red ? nil : :red
              Sketchup.set_status_text(@locked_axis ? '🔒 ล็อคแกนแดง X (Red Axis Locked)' : 'ปลดล็อคแกน', SB_PROMPT)
              view.invalidate
              return
            elsif (key == 37 || (defined?(VK_LEFT) && key == VK_LEFT)) && !repeat
              @locked_axis = @locked_axis == :green ? nil : :green
              Sketchup.set_status_text(@locked_axis ? '🔒 ล็อคแกนเขียว Y (Green Axis Locked)' : 'ปลดล็อคแกน', SB_PROMPT)
              view.invalidate
              return
            elsif (key == 38 || (defined?(VK_UP) && key == VK_UP)) && !repeat
              @locked_axis = @locked_axis == :blue ? nil : :blue
              Sketchup.set_status_text(@locked_axis ? '🔒 ล็อคแกนน้ำเงิน Z (Blue Axis Locked)' : 'ปลดล็อคแกน', SB_PROMPT)
              view.invalidate
              return
            elsif (key == 40 || (defined?(VK_DOWN) && key == VK_DOWN)) && !repeat
              @locked_axis = nil
              Sketchup.set_status_text('ปลดล็อคแกน', SB_PROMPT)
              view.invalidate
              return
            end
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            bounds.add(@start_point) if defined?(@start_point) && @start_point
            bounds.add(@input_point.position) if @input_point&.valid?
            bounds
          end

          def deactivate(view)
            @start_point = nil if defined?(@start_point)
            @start_input_point = nil
            @locked_axis = nil
            @numeric_length_mm = nil
            view.invalidate if view
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end

          private

          def constrained_position(pos)
            return pos unless @start_point && @locked_axis

            case @locked_axis
            when :red
              Geom::Point3d.new(pos.x, @start_point.y, @start_point.z)
            when :green
              Geom::Point3d.new(@start_point.x, pos.y, @start_point.z)
            when :blue
              Geom::Point3d.new(@start_point.x, @start_point.y, pos.z)
            else
              pos
            end
          end

          def create_conduit(start_pt, end_pt)
            start_pt_mm = Core::Units.point_to_mm(start_pt)
            end_pt_mm   = Core::Units.point_to_mm(end_pt)

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
              @start_point = end_pt
              @start_input_point = Sketchup::InputPoint.new(end_pt)
              @numeric_length_mm = nil
              Sketchup.set_status_text('สร้างแนวท่อร้อยสายไฟสำเร็จ (คลิกจุดถัดไป หรือ Esc เพื่อจบ)', SB_PROMPT)
              Sketchup.set_status_text('', SB_VCB_VALUE) if defined?(SB_VCB_VALUE)
            else
              UI.messagebox(result[:errors]&.join("
") || 'เกิดข้อผิดพลาดในการสร้างแนวท่อร้อยสาย')
              @start_point = nil
              @start_input_point = nil
            end
          end
        end
      end
    end
  end
end
