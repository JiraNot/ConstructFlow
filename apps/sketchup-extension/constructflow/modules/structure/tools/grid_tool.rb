# frozen_string_literal: true

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
            @interaction = Core::PlanInteractionEngine.new
            @references = Architecture::PlanReferenceCollector.new(runtime)
            @start_mm = nil
            @finish_mm = nil
          end

          def activate
            Sketchup.set_status_text('ConstructFlow Structural Grid: click start/end. Esc cancels.', SB_PROMPT)
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            unless @input_point.valid?
              @finish_mm = nil
              return view.invalidate
            end

            point = @plane.project(Core::Units.point_to_mm(@input_point.position))
            snapped = @interaction.snap(point, references: @references.paths(level_id: @level_id))[:point_mm]
            if @start_mm
              @finish_mm = snapped
            else
              @finish_mm = snapped
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
              @finish_mm = point
              view.invalidate
              return
            end

            result = @runtime.commands.execute(
              'CreateStructuralGrid',
              { name: @name, path_mm: [@start_mm, point], level_id: @level_id, offset_mm: @offset_mm },
              project_id: @runtime.project.project_id
            )
            if result[:status] == 'success'
              Sketchup.set_status_text('Grid created. Click start/end for another grid.', SB_PROMPT)
              refresh_plan
            else
              UI.messagebox(result[:errors].join("\n"))
            end
            @start_mm = nil
            @finish_mm = nil
            view.invalidate
          rescue StandardError => error
            UI.messagebox("ConstructFlow Grid error: #{error.message}")
          end

          def draw(view)
            return unless @start_mm && @finish_mm

            view.line_width = 2
            view.draw(GL_LINES, [point_from_mm(@start_mm), point_from_mm(@finish_mm)])
            view.draw_text(point_from_mm(@finish_mm), @name)
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            [@start_mm, @finish_mm].compact.each { |point_mm| bounds.add(point_from_mm(point_mm)) }
            bounds
          end

          def onCancel(_reason, view)
            @start_mm = nil
            @finish_mm = nil
            view.invalidate
          end

          def deactivate(view)
            @start_mm = nil
            @finish_mm = nil
            view.invalidate if view
          end

          private

          def point_from_mm(values_mm)
            values = Core::Units.point_from_mm(values_mm)
            Geom::Point3d.new(*values)
          end

          def refresh_plan
            return unless @runtime.respond_to?(:plan_scenes)

            @runtime.plan_scenes.refresh_preset('architecture.construction')
          rescue StandardError => error
            Sketchup.set_status_text("Grid created; plan refresh pending: #{error.message}", SB_PROMPT)
          end
        end
      end
    end
  end
end
