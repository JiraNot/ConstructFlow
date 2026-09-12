# frozen_string_literal: true

require_relative '../../../core/ghost_preview'
require_relative '../../../core/units'

module JiraNot
  module ConstructFlow
    module Structure
      module Tools
        class FoundationTool
          def initialize(runtime:, size_mm: [1000.0, 1000.0, 400.0], foundation_type: 'spread_footing')
            @runtime = runtime
            @size_mm = size_mm.map { |v| Float(v) }
            @foundation_type = foundation_type.to_s
            @input_point = Sketchup::InputPoint.new
            @hovered_column = nil
          end

          def activate
            Sketchup.set_status_text(
              "ConstructFlow ฐานราก: คลิกตำแหน่งบนพื้นหรือคลิกที่เสาเพื่อวางฐานราก คสล. (#{@size_mm[0].to_i}x#{@size_mm[1].to_i}x#{@size_mm[2].to_i} mm)",
              SB_PROMPT
            )
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            @hovered_column = pick_column(view, x, y)
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?

            if @hovered_column
              bounds = @hovered_column.entity.respond_to?(:bounds) ? @hovered_column.entity.bounds : nil
              if bounds
                center = bounds.center
                base_pt = [center.x, center.y, bounds.min.z]
                mesh = Core::GhostPreview.build_foundation_mesh(base_pt, @size_mm)
                if mesh
                  Core::GhostPreview.render_ghost(
                    view,
                    mesh,
                    face_color: [46, 204, 113, 80],
                    line_color: [39, 174, 96],
                    label: "วางฐานรากใต้เสา (คลิกเพื่อสร้าง)"
                  )
                end
              end
            elsif @input_point.valid?
              mesh = Core::GhostPreview.build_foundation_mesh(@input_point.position, @size_mm)
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

            if @hovered_column
              result = @runtime.commands.execute(
                'GenerateFoundation',
                {
                  column_object_id: @hovered_column.id,
                  foundation_type: @foundation_type,
                  size_mm: @size_mm
                },
                project_id: @runtime.project.project_id
              )
            else
              result = @runtime.commands.execute(
                'CreateFoundation',
                {
                  foundation_type: @foundation_type,
                  size_mm: @size_mm,
                  location_mm: Core::Units.point_to_mm(@input_point.position)
                },
                project_id: @runtime.project.project_id
              )
            end

            if result[:status] == 'success'
              @runtime.active_model.select_tool(nil)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          rescue StandardError => e
            UI.messagebox("ConstructFlow Foundation error: #{e.message}")
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end

          private

          def pick_column(view, x, y)
            return nil unless view.respond_to?(:pick_helper)

            helper = view.pick_helper
            helper.do_pick(x, y)
            helper.count.times do |index|
              path = helper.path_at(index)
              candidates = path.respond_to?(:to_a) ? path.to_a.reverse : [path]
              candidates.each do |entity|
                object = @runtime.smart_objects.fetch(entity) rescue nil
                return object if object && object.type == 'structure.column'
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
