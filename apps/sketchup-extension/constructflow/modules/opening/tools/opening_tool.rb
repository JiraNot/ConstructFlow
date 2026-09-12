# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Opening
      module Tools
        class OpeningTool
          def initialize(runtime:, width_mm:, height_mm:, sill_mm:)
            @runtime = runtime
            @width_mm = Float(width_mm)
            @height_mm = Float(height_mm)
            @sill_mm = Float(sill_mm)
            @input_point = Sketchup::InputPoint.new
            @host_capability = runtime.capabilities.fetch('wall.host_surface')
          end

          def activate
            Sketchup.set_status_text(
              'ConstructFlow ช่องเปิดผนัง: คลิกบนผนังอัจฉริยะเพื่อเจาะช่องเปิด (Esc เพื่อยกเลิก)',
              SB_PROMPT
            )
          end

          def deactivate(view)
            view.invalidate if view
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            @hovered_host = pick_host(view, x, y)
            @hovered_placement = nil
            if @hovered_host && @input_point.valid?
              point_mm = Core::Units.point_to_mm(@input_point.position)
              @hovered_placement = @host_capability.locate(@hovered_host, point_mm) rescue nil
            end
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?

            if @hovered_host && @hovered_placement
              wall_def = @host_capability.definition(@hovered_host) rescue nil
              if wall_def
                mesh = Core::GhostPreview.build_opening_mesh(
                  wall_def,
                  @hovered_placement[:segment_index],
                  @hovered_placement[:distance_along_mm],
                  @width_mm,
                  @height_mm,
                  @sill_mm
                )
                if mesh
                  Core::GhostPreview.render_ghost(
                    view,
                    mesh,
                    face_color: [231, 76, 60, 100],
                    line_color: [192, 57, 43]
                  )
                end
              end
            elsif @input_point.valid? && view.respond_to?(:draw_text)
              screen = view.respond_to?(:screen_coords) ? view.screen_coords(@input_point.position) : @input_point.position
              view.draw_text(screen, "ช่องเปิด #{@width_mm.to_i}x#{@height_mm.to_i} mm (ชี้ที่ผนังอัจฉริยะเพื่อกำหนดตำแหน่ง)")
            end
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            host = pick_host(view, x, y)
            unless host
              UI.beep
              Sketchup.set_status_text('Select a ConstructFlow Smart Wall.', SB_PROMPT)
              return
            end

            point_mm = Core::Units.point_to_mm(@input_point.position)
            placement = @host_capability.locate(host, point_mm)
            start_offset = placement[:distance_along_mm] - (@width_mm / 2.0)

            result = @runtime.commands.execute(
              'CreateOpening',
              {
                host_object_id: host.id,
                segment_index: placement[:segment_index],
                start_offset_mm: start_offset,
                width_mm: @width_mm,
                height_mm: @height_mm,
                sill_mm: @sill_mm
              },
              project_id: @runtime.project.project_id
            )

            if result[:status] == 'success'
              Sketchup.set_status_text('Opening created. Click another Smart Wall or Esc to finish.', SB_PROMPT)
              view.invalidate
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          rescue StandardError => error
            UI.messagebox("ConstructFlow Opening error: #{error.message}")
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end

          private

          def pick_host(view, x, y)
            helper = view.pick_helper
            helper.do_pick(x, y)
            helper.count.times do |index|
              path = helper.path_at(index)
              candidates = if path.respond_to?(:to_a)
                             path.to_a.reverse
                           else
                             [path]
                           end
              candidates.each do |entity|
                object = @runtime.smart_objects.fetch(entity)
                return object if @host_capability.compatible_host?(object)
              rescue StandardError
                next
              end
            end
            nil
          end
        end
      end
    end
  end
end
