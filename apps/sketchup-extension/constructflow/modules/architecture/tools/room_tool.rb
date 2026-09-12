# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Tools
        class RoomTool
          def initialize(runtime:, name:, number:, program: 'generic', level_id: nil)
            @runtime = runtime
            @name = name.to_s
            @number = number.to_s
            @program = program.to_s
            @level_id = level_id.to_s.strip
            @level_id = nil if @level_id.empty?
            @plane = Core::PlanLevelContext.new(runtime, @level_id)
            @level_id = @plane.level_id
            @interaction = Core::PlanInteractionEngine.new
            @references = PlanReferenceCollector.new(runtime)
            @input_point = Sketchup::InputPoint.new
            @points_mm = []
            @hover_mm = nil
          end

          def activate
            Sketchup.set_status_text('ConstructFlow Plan Room: click boundary points, click start or press Enter to finish.', SB_PROMPT)
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            @hover_mm = @input_point.valid? ? snap_point : nil
            view.invalidate
          end

          def onLButtonDown(_flags, _x, _y, view)
            @input_point.pick(view, _x, _y)
            return unless @input_point.valid?

            point = snap_point
            if @points_mm.length >= 3 && close_to_start?(point)
              finish(view)
            else
              @points_mm << point
              view.invalidate
            end
          rescue StandardError => error
            UI.messagebox("ConstructFlow Room error: #{error.message}")
            reset(view)
          end

          def onKeyDown(key, _repeat, _flags, view)
            finish(view) if key == 13
          end

          def draw(view)
            points = @points_mm.map { |point| point_from_mm(point) }
            points << point_from_mm(@hover_mm) if @hover_mm && !@points_mm.empty?
            view.line_width = 2
            view.draw(GL_LINE_STRIP, points) if points.length >= 2
          rescue StandardError
            nil
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            (@points_mm + (@hover_mm ? [@hover_mm] : [])).each { |point_mm| bounds.add(point_from_mm(point_mm)) }
            bounds
          end

          def onCancel(_reason, view)
            @points_mm.empty? ? @runtime.active_model.select_tool(nil) : reset(view)
          end

          def deactivate(view)
            @points_mm = []
            @hover_mm = nil
            view.invalidate if view
          end

          private

          def snap_point
            @interaction.snap(
              @plane.project(Core::Units.point_to_mm(@input_point.position)), references: @references.paths(level_id: @level_id)
            )[:point_mm]
          end

          def close_to_start?(point)
            start = @points_mm.first
            Math.sqrt(((point[0] - start[0])**2) + ((point[1] - start[1])**2)) <= 100.0
          end

          def finish(view)
            if @points_mm.length < 3
              Sketchup.set_status_text('A room boundary needs at least three points.', SB_PROMPT)
              return
            end

            input = { boundary_mm: @points_mm, name: @name, number: @number, program: @program }
            input[:level_id] = @level_id if @level_id
            result = @runtime.commands.execute('CreateRoom', input, project_id: @runtime.project.project_id)
            if result[:status] == 'success'
              refresh_plan
              reset(view)
              Sketchup.set_status_text('Room created. Draw another room or Esc to finish.', SB_PROMPT)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          end

          def refresh_plan
            return unless @runtime.respond_to?(:plan_scenes)

            @runtime.plan_scenes.refresh_preset('architecture.construction')
          rescue StandardError => error
            Sketchup.set_status_text("Room created; plan refresh pending: #{error.message}", SB_PROMPT)
          end

          def reset(view)
            @points_mm = []
            @hover_mm = nil
            view.invalidate
          end

          def point_from_mm(values)
            x, y, z = Core::Units.point_from_mm(values)
            Geom::Point3d.new(x, y, z)
          end
        end
      end
    end
  end
end
