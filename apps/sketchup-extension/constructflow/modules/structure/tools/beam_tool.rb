# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      module Tools
        class BeamTool
          def initialize(runtime:, section_mm: [200, 300], level_id: nil, base_offset_mm: 0)
            @runtime = runtime
            @section_mm = section_mm
            @level_id = level_id.to_s.strip
            @level_id = nil if @level_id.empty?
            @base_offset_mm = Float(base_offset_mm)
            @plane = Core::PlanLevelContext.new(runtime, @level_id, offset_mm: @base_offset_mm)
            @level_id = @plane.level_id
            @input_point = Sketchup::InputPoint.new
            @interaction = Core::PlanInteractionEngine.new
            @references = Architecture::PlanReferenceCollector.new(runtime)
            @start_mm = nil
            @finish_mm = nil
          end

          def activate
            Sketchup.set_status_text('ConstructFlow Structural Beam: click start/end. Esc cancels.', SB_PROMPT)
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            if @input_point.valid?
              point = @plane.project(Core::Units.point_to_mm(@input_point.position))
              @finish_mm = @interaction.snap(point, references: @references.paths(level_id: @level_id))[:point_mm]
            else
              @finish_mm = nil
            end
            view.invalidate
          end

          def onLButtonDown(_flags, _x, _y, view)
            return unless @input_point.valid?

            point = @finish_mm || @plane.project(Core::Units.point_to_mm(@input_point.position))
            if @start_mm.nil?
              @start_mm = point
              view.invalidate
              return
            end

            result = @runtime.commands.execute(
              'CreateBeam',
              { path_mm: [@start_mm, point], section_mm: @section_mm,
                base_level_id: @level_id, base_offset_mm: @base_offset_mm },
              project_id: @runtime.project.project_id
            )
            if result[:status] == 'success'
              refresh_plan
              Sketchup.set_status_text('Beam created. Click start/end for another beam.', SB_PROMPT)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
            @start_mm = nil
            @finish_mm = nil
            view.invalidate
          rescue StandardError => error
            UI.messagebox("ConstructFlow Beam error: #{error.message}")
          end

          def draw(view)
            return unless @start_mm && @finish_mm

            view.line_width = 3
            view.draw(GL_LINES, [point_from_mm(@start_mm), point_from_mm(@finish_mm)])
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
            Sketchup.set_status_text("Beam created; plan refresh pending: #{error.message}", SB_PROMPT)
          end
        end
      end
    end
  end
end
