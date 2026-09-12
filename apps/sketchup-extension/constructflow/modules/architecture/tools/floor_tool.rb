# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Tools
        class FloorTool
          CLOSE_TOLERANCE_MM = 100.0

          def initialize(runtime:, thickness_mm:, level_id: nil, snap_tolerance_mm: 100.0)
            @runtime = runtime
            @thickness_mm = Float(thickness_mm)
            @level_id = level_id.to_s.strip
            @level_id = nil if @level_id.empty?
            @plane = Core::PlanLevelContext.new(runtime, @level_id)
            @level_id = @plane.level_id
            @interaction = Core::PlanInteractionEngine.new(snap_tolerance_mm: snap_tolerance_mm)
            @references = PlanReferenceCollector.new(runtime)
            @input_point = Sketchup::InputPoint.new
            @points_mm = []
            @hover_mm = nil
          end

          def activate
            Sketchup.set_status_text(
              'ConstructFlow Plan Floor: click boundary points, click start point or press Enter to finish. Esc cancels.',
              SB_PROMPT
            )
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            @hover_mm = @input_point.valid? ? snapped_point : nil
            view.invalidate
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            point = snapped_point
            if @points_mm.length >= 3 && close_to_start?(point)
              finish_boundary(view)
            else
              @points_mm << point
              @hover_mm = point
              Sketchup.set_status_text("Floor boundary: #{@points_mm.length} points. Enter to finish.", SB_PROMPT)
              view.invalidate
            end
          rescue StandardError => error
            UI.messagebox("ConstructFlow Floor error: #{error.message}")
            reset(view)
          end

          def onKeyDown(key, _repeat, _flags, view)
            return unless key == 13

            finish_boundary(view)
          end

          def draw(view)
            points = @points_mm.map { |point_mm| point_from_mm(point_mm) }
            if @hover_mm && !@points_mm.empty?
              points << point_from_mm(@hover_mm)
            end
            view.line_width = 2
            view.draw(GL_LINE_STRIP, points) if points.length >= 2
            view.draw_points([point_from_mm(@points_mm.first)], 8, 1, 'orange') if @points_mm.length >= 3
          rescue StandardError
            nil
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            (@points_mm + (@hover_mm ? [@hover_mm] : [])).each { |point_mm| bounds.add(point_from_mm(point_mm)) }
            bounds
          end

          def onCancel(_reason, view)
            if @points_mm.empty?
              @runtime.active_model.select_tool(nil)
            else
              reset(view)
            end
          end

          def deactivate(view)
            @points_mm = []
            @hover_mm = nil
            view.invalidate if view
          end

          private

          def snapped_point
            @interaction.snap(
              @plane.project(Core::Units.point_to_mm(@input_point.position)), references: @references.paths(level_id: @level_id)
            )[:point_mm]
          end

          def close_to_start?(point)
            start = @points_mm.first
            Math.sqrt(((point[0] - start[0])**2) + ((point[1] - start[1])**2)) <= CLOSE_TOLERANCE_MM
          end

          def finish_boundary(view)
            if @points_mm.length < 3
              Sketchup.set_status_text('A floor boundary needs at least three points.', SB_PROMPT)
              return
            end

            input = { boundary_mm: @points_mm, thickness_mm: @thickness_mm }
            input[:level_id] = @level_id if @level_id
            result = @runtime.commands.execute('CreateFloor', input, project_id: @runtime.project.project_id)
            if result[:status] == 'success'
              refresh_plan
              reset(view)
              Sketchup.set_status_text('Architectural floor created. Draw another boundary or Esc to finish.', SB_PROMPT)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          end

          def refresh_plan
            return unless @runtime.respond_to?(:plan_scenes)

            @runtime.plan_scenes.refresh_preset('architecture.construction')
          rescue StandardError => error
            Sketchup.set_status_text("Floor created; plan refresh pending: #{error.message}", SB_PROMPT)
          end

          def reset(view)
            @points_mm = []
            @hover_mm = nil
            view.invalidate
          end

          def point_from_mm(point_mm)
            values = Core::Units.point_from_mm(point_mm)
            Geom::Point3d.new(*values)
          end
        end
      end
    end
  end
end
