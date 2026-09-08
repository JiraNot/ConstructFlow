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
          end

          def activate
            Sketchup.set_status_text('ConstructFlow Interior: click cabinet run origin. Esc to cancel.', SB_PROMPT)
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            result = @runtime.commands.execute(
              'CreateCabinetRun',
              @params.merge(origin_mm: Core::Units.point_to_mm(@input_point.position)),
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
        end
      end
    end
  end
end
