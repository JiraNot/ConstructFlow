# frozen_string_literal: true

require_relative "../../../core/plan_interaction_engine"

module JiraNot
  module ConstructFlow
    module Structure
      module Tools
        class GridTool
          def initialize(runtime:, name: 'Grid', level_id: nil, offset_mm: 0)
            @runtime = runtime
            @name = name.to_s
            @level_id = level_id.to_s.strip
            @level_id = nil if @level_id.empty?
            @plane = Core::PlanLevelContext.new(runtime, @level_id)
            @level_id = @plane.level_id
            @offset_mm = Float(offset_mm)
            @input_point = Sketchup::InputPoint.new
            @start_input_point = nil
            @interaction = Core::PlanInteractionEngine.new
            @references = Architecture::PlanReferenceCollector.new(runtime)
            @start_mm = nil
            @finish_mm = nil
            @locked_axis = nil
            @numeric_length_mm = nil
          end

          def activate
            @locked_axis = nil
            @numeric_length_mm = nil
            @start_mm = nil
            @start_input_point = nil
            @finish_mm = nil
            Sketchup.set_status_text('ConstructFlow เส้นกริดโครงสร้าง (Structural Grid): คลิกจุดเริ่ม/ปลาย. ลูกศรเพื่อล็อคแกน; พิมพ์ระยะใน VCB. Esc เพื่อยกเลิก', (defined?(SB_PROMPT) ? SB_PROMPT : nil))
            Sketchup.set_status_text('ระยะกริด (Length)', SB_VCB_LABEL) if defined?(SB_VCB_LABEL)
            Sketchup.set_status_text('', SB_VCB_VALUE) if defined?(SB_VCB_VALUE)
          end

          def onMouseMove(_flags, x, y, view)
            if @start_mm && @start_input_point
              @input_point.pick(view, x, y, @start_input_point)
            else
              @input_point.pick(view, x, y)
            end

            unless @input_point.valid?
              @finish_mm = nil
              return view.invalidate
            end

            point = @plane.project(Core::Units.point_to_mm(@input_point.position))
            snapped = @interaction.snap(point, references: @references.paths(level_id: @level_id))[:point_mm]
            if @start_mm
              mode = current_constraint_mode
              preview = @interaction.segment_preview(
                @start_mm, snapped, mode: mode, references: @references.paths(level_id: @level_id),
                length_mm: @numeric_length_mm
              )
              @finish_mm = preview[:finish_mm]
              if defined?(SB_VCB_LABEL)
                Sketchup.set_status_text('ระยะกริด (Length)', SB_VCB_LABEL)
                Sketchup.set_status_text(format('%.1f mm', preview[:length_mm]), SB_VCB_VALUE)
              end
            else
              @finish_mm = snapped
              if defined?(SB_VCB_LABEL)
                Sketchup.set_status_text('ระยะกริด (Length)', SB_VCB_LABEL)
                Sketchup.set_status_text('', SB_VCB_VALUE)
              end
            end
            view.invalidate
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            point = @interaction.snap(
              @plane.project(Core::Units.point_to_mm(@input_point.position)), references: @references.paths(level_id: @level_id)
            )[:point_mm]
            if @start_mm.nil?
              @start_mm = point
              @start_input_point = Sketchup::InputPoint.new(@input_point.position)
              @finish_mm = point
              Sketchup.set_status_text('คลิกจุดสิ้นสุดแนวกริด หรือ พิมพ์ระยะใน VCB แล้วกด Enter', (defined?(SB_PROMPT) ? SB_PROMPT : nil))
              view.invalidate
              return
            end

            create_grid(@start_mm, @finish_mm || point)
            @start_mm = nil
            @start_input_point = nil
            @finish_mm = nil
            @numeric_length_mm = nil
            view.invalidate
          end

          def enableVCB?
            true
          end

          def onUserText(text, view)
            length_mm = @interaction.numeric_distance_mm(text)
            @numeric_length_mm = length_mm

            unless @start_mm
              Sketchup.set_status_text("กำหนดระยะกริด #{length_mm.round(1)} mm (คลิกจุดเริ่มต้นเพื่อวางกริด)", (defined?(SB_PROMPT) ? SB_PROMPT : nil))
              view.invalidate
              return
            end

            candidate = @finish_mm || [@start_mm[0] + 100.0, @start_mm[1], @start_mm[2]]
            preview = @interaction.segment_preview(
              @start_mm, candidate, mode: current_constraint_mode, references: @references.paths(level_id: @level_id),
              length_mm: length_mm
            )
            finish = preview[:finish_mm]

            create_grid(@start_mm, finish)
            @start_mm = nil
            @start_input_point = nil
            @finish_mm = nil
            @numeric_length_mm = nil
            Sketchup.set_status_text("สร้างเส้นกริดความยาว #{length_mm.round(1)} mm สำเร็จ", (defined?(SB_PROMPT) ? SB_PROMPT : nil))
            Sketchup.set_status_text('', SB_VCB_VALUE) if defined?(SB_VCB_VALUE)
            view.invalidate
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end

          def onKeyDown(key, repeat, _flags, view)
            if (key == 39 || (defined?(VK_RIGHT) && key == VK_RIGHT)) && !repeat
              @locked_axis = @locked_axis == :red ? nil : :red
              Sketchup.set_status_text(@locked_axis ? '🔒 ล็อคแกนแดง X (Red Axis Locked)' : 'ปลดล็อคแกน', (defined?(SB_PROMPT) ? SB_PROMPT : nil))
              view.invalidate
              return
            elsif (key == 37 || (defined?(VK_LEFT) && key == VK_LEFT)) && !repeat
              @locked_axis = @locked_axis == :green ? nil : :green
              Sketchup.set_status_text(@locked_axis ? '🔒 ล็อคแกนเขียว Y (Green Axis Locked)' : 'ปลดล็อคแกน', (defined?(SB_PROMPT) ? SB_PROMPT : nil))
              view.invalidate
              return
            elsif (key == 38 || (defined?(VK_UP) && key == VK_UP)) && !repeat
              @locked_axis = @locked_axis == :blue ? nil : :blue
              Sketchup.set_status_text(@locked_axis ? '🔒 ล็อคแกนน้ำเงิน Z (Blue Axis Locked)' : 'ปลดล็อคแกน', (defined?(SB_PROMPT) ? SB_PROMPT : nil))
              view.invalidate
              return
            elsif (key == 40 || (defined?(VK_DOWN) && key == VK_DOWN)) && !repeat
              @locked_axis = nil
              Sketchup.set_status_text('ปลดล็อคแกน (Orthogonal Mode)', (defined?(SB_PROMPT) ? SB_PROMPT : nil))
              view.invalidate
              return
            end

            if defined?(Core::ShortcutManager) && Core::ShortcutManager.handle_key(key, @runtime, view)
              return
            end
          end

          def draw(view)
            return unless @start_mm && @finish_mm

            start_pt = point_from_mm(@start_mm)
            finish_pt = point_from_mm(@finish_mm)

            color = 'blue'
            dx = @finish_mm[0] - @start_mm[0]
            dy = @finish_mm[1] - @start_mm[1]
            if @locked_axis == :red || (dy.abs <= 0.001 && dx.abs > 0.001)
              color = 'red'
              if view.respond_to?(:line_stipple=)
                view.drawing_color = 'red'
                view.line_stipple = '_'
                view.draw(GL_LINES, [Geom::Point3d.new(start_pt.x - 50.m, start_pt.y, start_pt.z), Geom::Point3d.new(start_pt.x + 50.m, start_pt.y, start_pt.z)])
                view.line_stipple = ''
              end
            elsif @locked_axis == :green || (dx.abs <= 0.001 && dy.abs > 0.001)
              color = 'green'
              if view.respond_to?(:line_stipple=)
                view.drawing_color = 'green'
                view.line_stipple = '_'
                view.draw(GL_LINES, [Geom::Point3d.new(start_pt.x, start_pt.y - 50.m, start_pt.z), Geom::Point3d.new(start_pt.x, start_pt.y + 50.m, start_pt.z)])
                view.line_stipple = ''
              end
            end

            view.line_width = 2
            view.drawing_color = color
            view.draw(GL_LINES, [start_pt, finish_pt])
            @input_point.draw(view) if @input_point&.valid?

            if view.respond_to?(:draw_text)
              len = Math.sqrt((dx * dx) + (dy * dy))
              view.draw_text(finish_pt, format('%s L %.0f mm', @name, len))
            end
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            [@start_mm, @finish_mm].compact.each { |point_mm| bounds.add(point_from_mm(point_mm)) }
            bounds
          end

          def onCancel(_reason, view)
            @start_mm = nil
            @start_input_point = nil
            @finish_mm = nil
            @locked_axis = nil
            @numeric_length_mm = nil
            view.invalidate
          end

          def deactivate(view)
            @start_mm = nil
            @start_input_point = nil
            @finish_mm = nil
            @locked_axis = nil
            @numeric_length_mm = nil
            view.invalidate if view
          end

          private

          def current_constraint_mode
            case @locked_axis
            when :red then :axis_x
            when :green then :axis_y
            when :blue then :axis_z
            else :orthogonal
            end
          end

          def create_grid(start_pt, end_pt)
            result = @runtime.commands.execute(
              'CreateStructuralGrid',
              { name: @name, path_mm: [start_pt, end_pt], level_id: @level_id, offset_mm: @offset_mm },
              project_id: @runtime.project.project_id
            )
            if result[:status] == 'success'
              refresh_plan
              Sketchup.set_status_text("Grid '#{@name}' created.", (defined?(SB_PROMPT) ? SB_PROMPT : nil))
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          end

          def point_from_mm(values_mm)
            values = Core::Units.point_from_mm(values_mm)
            Geom::Point3d.new(*values)
          end

          def refresh_plan
            return unless @runtime.respond_to?(:plan_scenes)

            @runtime.plan_scenes.refresh_preset('architecture.construction')
          rescue StandardError => error
            Sketchup.status_text = "Grid created; plan refresh pending: #{error.message}", SB_PROMPT
          end
        end
      end
    end
  end
end
