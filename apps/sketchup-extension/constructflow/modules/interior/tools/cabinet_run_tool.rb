# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      module Tools
        class CabinetRunTool
          def initialize(runtime:, params:)
            @runtime = runtime
            @params = params
            @input_point = Sketchup::InputPoint.new
            @interaction = Core::PlanInteractionEngine.new
            @preview_point_mm = nil
          end

          def activate
            Sketchup.set_status_text('ConstructFlow Interior: click cabinet run origin. Esc to cancel.', SB_PROMPT)
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            @preview_point_mm = if @input_point.valid?
                                  @interaction.snap(
                                    Core::Units.point_to_mm(@input_point.position),
                                    references: plan_references
                                  )[:point_mm]
                                else
                                  nil
                                end
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?
            return unless @preview_point_mm

            view.draw_points([point_from_mm(@preview_point_mm)], 8, 1, 'orange')
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            bounds.add(point_from_mm(@preview_point_mm)) if @preview_point_mm
            bounds
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            point_mm = if @preview_point_mm
                         @preview_point_mm
                       else
                         @interaction.snap(
                           Core::Units.point_to_mm(@input_point.position),
                           references: plan_references
                         )[:point_mm]
                       end
            result = @runtime.commands.execute(
              'CreateCabinetRun',
              @params.merge(origin_mm: point_mm),
              project_id: @runtime.project.project_id
            )
            if result[:status] == 'success'
              @runtime.active_model.select_tool(nil)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          rescue StandardError => error
            UI.messagebox("ConstructFlow Interior error: #{error.message}")
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end

          def deactivate(view)
            @preview_point_mm = nil
            view.invalidate if view
          end

          private

          def plan_references
            return [] unless @runtime.respond_to?(:smart_objects)

            if defined?(Architecture::PlanReferenceCollector)
              Architecture::PlanReferenceCollector.new(@runtime).paths(level_id: placement_level_id)
            else
              []
            end
          rescue StandardError
            []
          end

          def placement_level_id
            @params[:base_level_id] || @params['base_level_id'] || @params[:level_id] || @params['level_id']
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
