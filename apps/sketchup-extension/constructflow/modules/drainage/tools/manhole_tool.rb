# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      module Tools
        class ManholeTool
          def initialize(runtime:, size_mm:, cover_level_mm:, invert_in_mm:, invert_out_mm:)
            @runtime = runtime
            @size_mm = size_mm
            @cover_level_mm = cover_level_mm
            @invert_in_mm = invert_in_mm
            @invert_out_mm = invert_out_mm
            @input_point = Sketchup::InputPoint.new
            @interaction = Core::PlanInteractionEngine.new
            @preview_position_mm = nil
          end

          def activate
            Sketchup.set_status_text('ConstructFlow Drainage: click to place manhole. Esc to finish.', SB_PROMPT)
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            @preview_position_mm = @input_point.valid? ? snapped_point : nil
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?
            view.draw_points([point_from_mm(@preview_position_mm)], 8, 1, 'orange') if @preview_position_mm
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            bounds.add(point_from_mm(@preview_position_mm)) if @preview_position_mm
            bounds
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            result = @runtime.commands.execute(
              'PlaceManhole',
              {
                location_mm: @preview_position_mm || snapped_point,
                size_mm: @size_mm,
                cover_level_mm: @cover_level_mm,
                invert_in_mm: @invert_in_mm,
                invert_out_mm: @invert_out_mm
              },
              project_id: @runtime.project.project_id
            )
            if result[:status] == 'success'
              view.invalidate
              Sketchup.set_status_text('Manhole placed. Click again or Esc to finish.', SB_PROMPT)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          rescue StandardError => error
            UI.messagebox("ConstructFlow Drainage error: #{error.message}")
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end

          def deactivate(view)
            @preview_position_mm = nil
            view.invalidate if view
          end

          private

          def snapped_point
            @interaction.snap(Core::Units.point_to_mm(@input_point.position), references: plan_references)[:point_mm]
          end

          def plan_references
            return [] unless defined?(Architecture::PlanReferenceCollector)

            Architecture::PlanReferenceCollector.new(@runtime).paths
          rescue StandardError
            []
          end

          def point_from_mm(point_mm)
            values = Core::Units.point_from_mm(point_mm)
            Geom::Point3d.new(*values)
          end
        end

        class RelocateManholeTool
          def initialize(runtime:, manhole_object_id:)
            @runtime = runtime
            @manhole_object_id = manhole_object_id.to_s
            @input_point = Sketchup::InputPoint.new
            @interaction = Core::PlanInteractionEngine.new
            @preview_position_mm = nil
          end

          def activate
            Sketchup.set_status_text('ConstructFlow Drainage: click new manhole location. Esc to cancel.', SB_PROMPT)
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            @preview_position_mm = @input_point.valid? ? snapped_point : nil
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?
            view.draw_points([point_from_mm(@preview_position_mm)], 8, 1, 'orange') if @preview_position_mm
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            bounds.add(point_from_mm(@preview_position_mm)) if @preview_position_mm
            bounds
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            result = @runtime.commands.execute(
              'RelocateManhole',
              {
                object_id: @manhole_object_id,
                new_location_mm: @preview_position_mm || snapped_point
              },
              project_id: @runtime.project.project_id
            )
            if result[:status] == 'success'
              @runtime.active_model.select_tool(nil)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          rescue StandardError => error
            UI.messagebox("ConstructFlow Relocate Manhole error: #{error.message}")
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end

          def deactivate(view)
            @preview_position_mm = nil
            view.invalidate if view
          end

          private

          def snapped_point
            @interaction.snap(Core::Units.point_to_mm(@input_point.position), references: plan_references)[:point_mm]
          end

          def plan_references
            return [] unless defined?(Architecture::PlanReferenceCollector)

            Architecture::PlanReferenceCollector.new(@runtime).paths
          rescue StandardError
            []
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
