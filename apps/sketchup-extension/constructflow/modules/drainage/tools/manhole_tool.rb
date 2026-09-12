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
          end

          def activate
            Sketchup.set_status_text('ConstructFlow บ่อพักน้ำทิ้ง: คลิกตำแหน่งเพื่อวางบ่อพัก (Esc เพื่อยกเลิก)', SB_PROMPT)
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?

            if @input_point.valid?
              mesh = Core::GhostPreview.build_manhole_mesh(@input_point.position, @size_mm)
              if mesh
                Core::GhostPreview.render_ghost(
                  view,
                  mesh,
                  face_color: [149, 165, 166, 80],
                  line_color: [127, 140, 141]
                )
              end
            end
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            result = @runtime.commands.execute(
              'PlaceManhole',
              {
                location_mm: Core::Units.point_to_mm(@input_point.position),
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
        end

        class RelocateManholeTool
          def initialize(runtime:, manhole_object_id:)
            @runtime = runtime
            @manhole_object_id = manhole_object_id.to_s
            @input_point = Sketchup::InputPoint.new
          end

          def activate
            Sketchup.set_status_text('ConstructFlow Drainage: click new manhole location. Esc to cancel.', SB_PROMPT)
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?

            if @input_point.valid?
              mesh = Core::GhostPreview.build_manhole_mesh(@input_point.position, [600, 600])
              if mesh
                Core::GhostPreview.render_ghost(
                  view,
                  mesh,
                  face_color: [243, 156, 18, 80],
                  line_color: [211, 84, 0],
                  label: 'ย้ายตำแหน่งบ่อพักน้ำทิ้ง'
                )
              end
            end
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            result = @runtime.commands.execute(
              'RelocateManhole',
              {
                object_id: @manhole_object_id,
                new_location_mm: Core::Units.point_to_mm(@input_point.position)
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
        end
      end
    end
  end
end
