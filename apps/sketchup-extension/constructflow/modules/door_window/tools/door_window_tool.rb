# frozen_string_literal: true

require_relative '../../../core/ghost_preview'
require_relative '../../../core/units'

module JiraNot
  module ConstructFlow
    module DoorWindow
      module Tools
        class DoorWindowTool
          def initialize(runtime:, category: 'door', operation: 'swing', frame_material: 'aluminium', panel_style: 'glazed')
            @runtime = runtime
            @category = category.to_s
            @operation = operation.to_s
            @frame_material = frame_material.to_s
            @panel_style = panel_style.to_s
            @input_point = Sketchup::InputPoint.new
            @hovered_opening = nil
          end

          def activate
            Sketchup.set_status_text(
              "ConstructFlow ติดตั้ง#{@category == 'door' ? 'ประตู' : 'หน้าต่าง'}: เลื่อนเมาส์ชี้ที่ช่องเปิด (Opening) แล้วคลิกเพื่อติดตั้ง • Esc เพื่อยกเลิก",
              SB_PROMPT
            )
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            @hovered_opening = pick_opening(view, x, y)
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?

            if @hovered_opening
              mesh = Core::GhostPreview.build_door_window_mesh(@hovered_opening, @category, @operation)
              if mesh
                Core::GhostPreview.render_ghost(
                  view,
                  mesh,
                  face_color: [41, 128, 185, 90],
                  line_color: [31, 97, 141],
                  label: "คลิกเพื่อติดตั้ง#{@category == 'door' ? 'ประตู' : 'หน้าต่าง'} (#{@operation})"
                )
              end
            elsif @input_point.valid? && view.respond_to?(:draw_text)
              screen = view.respond_to?(:screen_coords) ? view.screen_coords(@input_point.position) : @input_point.position
              view.draw_text(screen, "นำเมาส์ไปชี้ที่ช่องเปิด (Opening) เพื่อติดตั้ง#{@category == 'door' ? 'ประตู' : 'หน้าต่าง'}")
            end
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            unless @hovered_opening
              UI.beep
              Sketchup.set_status_text('กรุณาคลิกเลือกช่องเปิด (Opening) บนผนัง', SB_PROMPT)
              return
            end

            result = @runtime.commands.execute(
              'CreateDoorWindow',
              {
                opening_object_id: @hovered_opening.id,
                category: @category,
                operation: @operation,
                frame_material: @frame_material,
                panel_style: @panel_style
              },
              project_id: @runtime.project.project_id
            )

            if result[:status] == 'success'
              @runtime.active_model.select_tool(nil)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          rescue StandardError => e
            UI.messagebox("ConstructFlow Door/Window error: #{e.message}")
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            bounds.add(@input_point.position) if @input_point&.valid?
            bounds
          end

          def deactivate(view)
            @hovered_opening = nil
            view.invalidate if view
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end

          private

          def pick_opening(view, x, y)
            return nil unless view.respond_to?(:pick_helper)

            helper = view.pick_helper
            helper.do_pick(x, y)
            helper.count.times do |index|
              path = helper.path_at(index)
              candidates = path.respond_to?(:to_a) ? path.to_a.reverse : [path]
              candidates.each do |entity|
                object = @runtime.smart_objects.fetch(entity) rescue nil
                return object if object && object.type == 'opening.aperture'
              end
            end
            nil
          rescue StandardError
            nil
          end
        end
      end
    end
  end
end
