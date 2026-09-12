# frozen_string_literal: true

require_relative '../../../core/ghost_preview'
require_relative '../../../core/units'

module JiraNot
  module ConstructFlow
    module Drainage
      module Tools
        class PipeTool
          def initialize(runtime:, diameter_mm: 100.0, system: 'waste')
            @runtime = runtime
            @diameter_mm = Float(diameter_mm)
            @system = system.to_s
            @input_point = Sketchup::InputPoint.new
            @start_manhole = nil
            @start_point = nil
          end

          def activate
            Sketchup.set_status_text(
              "ConstructFlow ท่อระบายน้ำ: คลิกเลือกบ่อพักต้นทาง (Upstream Manhole) • Esc เพื่อยกเลิก",
              SB_PROMPT
            )
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            @hovered_manhole = pick_manhole(view, x, y)
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?

            if @start_point && @input_point.valid?
              target = @hovered_manhole ? manhole_center(@hovered_manhole) : @input_point.position
              mesh = Core::GhostPreview.build_pipe_mesh(@start_point, target, @diameter_mm)
              if mesh
                Core::GhostPreview.render_ghost(
                  view,
                  mesh,
                  face_color: [52, 152, 219, 80],
                  line_color: [41, 128, 185],
                  label: "แนวท่อระบายน้ำ: Slope #{mesh[:slope_pct]}% (คลิกที่บ่อพักปลายทางเพื่อเชื่อมต่อ)"
                )
              end
            elsif @hovered_manhole && view.respond_to?(:draw_text)
              screen = view.respond_to?(:screen_coords) ? view.screen_coords(@input_point.position) : @input_point.position
              view.draw_text(screen, "คลิกเลือกบ่อพักต้นทาง")
            end
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            manhole = pick_manhole(view, x, y)
            unless manhole
              UI.beep
              Sketchup.set_status_text('กรุณาคลิกเลือกวัตถุบ่อพักน้ำทิ้ง (Manhole)', SB_PROMPT)
              return
            end

            if @start_manhole.nil?
              @start_manhole = manhole
              @start_point = manhole_center(manhole)
              Sketchup.set_status_text('เลือกบ่อพักต้นทางแล้ว: คลิกเลือกบ่อพักปลายทาง (Downstream Manhole)', SB_PROMPT)
              view.invalidate
              return
            end

            # Connect 2 manholes
            start_id = @runtime.connectors.connectors_for(@start_manhole.id).find { |i| i['role'] == 'outlet' }&.dig('id')
            end_id   = @runtime.connectors.connectors_for(manhole.id).find { |i| i['role'] == 'inlet' }&.dig('id')

            result = @runtime.commands.execute(
              'CreatePipeRoute',
              { start_connector_id: start_id, end_connector_id: end_id, system: @system },
              project_id: @runtime.project.project_id
            )

            if result[:status] == 'success'
              @runtime.active_model.select_tool(nil)
            else
              UI.messagebox(result[:errors].join("\n"))
              @start_manhole = nil
              @start_point = nil
            end
          rescue StandardError => e
            UI.messagebox("ConstructFlow Pipe error: #{e.message}")
            @start_manhole = nil
            @start_point = nil
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            bounds.add(@start_point) if @start_point
            bounds.add(@input_point.position) if @input_point&.valid?
            bounds
          end

          def deactivate(view)
            @start_manhole = nil
            @start_point = nil
            view.invalidate if view
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end

          private

          def pick_manhole(view, x, y)
            return nil unless view.respond_to?(:pick_helper)

            helper = view.pick_helper
            helper.do_pick(x, y)
            helper.count.times do |index|
              path = helper.path_at(index)
              candidates = path.respond_to?(:to_a) ? path.to_a.reverse : [path]
              candidates.each do |entity|
                object = @runtime.smart_objects.fetch(entity) rescue nil
                return object if object && object.type == 'drainage.manhole'
              end
            end
            nil
          rescue StandardError
            nil
          end

          def manhole_center(manhole)
            bounds = manhole.entity.respond_to?(:bounds) ? manhole.entity.bounds : nil
            bounds ? bounds.center : @input_point.position
          end
        end
      end
    end
  end
end
