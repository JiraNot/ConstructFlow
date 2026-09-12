# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      module Tools
        class BoundaryTool
          CLOSE_TOLERANCE_MM = 100.0

          def initialize(runtime:, roof_form: 'lean_to', slope_percent: 5.0, covering_system: 'metal_sheet', snap_tolerance_mm: 100.0)
            @runtime = runtime
            @roof_form = roof_form.to_s
            @slope_percent = Float(slope_percent)
            @covering_system = covering_system.to_s
            @interaction = Core::PlanInteractionEngine.new(snap_tolerance_mm: snap_tolerance_mm)
            @input_point = Sketchup::InputPoint.new
            @points_mm = []
            @hover_mm = nil
          end

          def activate
            Sketchup.set_status_text(
              'ConstructFlow Plan Roof: click footprint points, click start or press Enter to finish. Esc cancels.',
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
              Sketchup.set_status_text("Roof footprint: #{@points_mm.length} points. Enter to finish.", SB_PROMPT)
              view.invalidate
            end
          rescue StandardError => error
            UI.messagebox("ConstructFlow Roof error: #{error.message}")
            reset(view)
          end

          def onKeyDown(key, _repeat, _flags, view)
            finish_boundary(view) if key == 13
          end

          def draw(view)
            points = @points_mm.map { |point_mm| point_from_mm(point_mm) }
            points << point_from_mm(@hover_mm) if @hover_mm && !@points_mm.empty?
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
            references = if defined?(Architecture::PlanReferenceCollector)
                           Architecture::PlanReferenceCollector.new(@runtime).paths
                         else
                           []
                         end
            @interaction.snap(Core::Units.point_to_mm(@input_point.position), references: references)[:point_mm]
          rescue StandardError
            Core::Units.point_to_mm(@input_point.position)
          end

          def close_to_start?(point)
            start = @points_mm.first
            Math.sqrt(((point[0] - start[0])**2) + ((point[1] - start[1])**2)) <= CLOSE_TOLERANCE_MM
          end

          def finish_boundary(view)
            if @points_mm.length < 3
              Sketchup.set_status_text('A roof footprint needs at least three points.', SB_PROMPT)
              return
            end

            result = @runtime.commands.execute(
              'GenerateRoof',
              { boundary_mm: @points_mm, roof_form: @roof_form, slope_percent: @slope_percent, covering_system: @covering_system },
              project_id: @runtime.project.project_id
            )
            if result[:status] == 'success'
              reset(view)
              Sketchup.set_status_text('Roof created. Draw another footprint or press Esc to finish.', SB_PROMPT)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
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
