# frozen_string_literal: true

require_relative '../../../core/ghost_preview'
require_relative '../../../core/units'

module JiraNot
  module ConstructFlow
    module Interior
      module Tools
        class WardrobeTool
          def initialize(runtime:, width_mm: 1800.0, height_mm: 2400.0, depth_mm: 600.0, door_type: 'hinged')
            @runtime = runtime
            @width_mm = Float(width_mm)
            @height_mm = Float(height_mm)
            @depth_mm = Float(depth_mm)
          @door_type = door_type.to_s
          @input_point = Sketchup::InputPoint.new
          @hover_point_mm = nil
          end

          def activate
            Sketchup.set_status_text(
              "ConstructFlow ตู้เสื้อผ้า: คลิกเพื่อวางตู้เสื้อผ้า (#{[@width_mm, @height_mm, @depth_mm].map { |value| Core::Units.format_dimension(value) }.join(' × ')} - #{@door_type}) • Esc เพื่อยกเลิก",
              SB_PROMPT
            )
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            @hover_point_mm = if @input_point.valid?
                                Core::Units.point_to_mm(@input_point.position)
                              else
                                nil
                              end
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?

            if @input_point.valid?
              preview_point = if @hover_point_mm
                                Geom::Point3d.new(*Core::Units.point_from_mm(@hover_point_mm))
                              else
                                @input_point.position
                              end
              mesh = Core::GhostPreview.build_wardrobe_mesh(
                preview_point,
                @width_mm,
                @height_mm,
                @depth_mm,
                @door_type
              )
              if mesh
                Core::GhostPreview.render_ghost(
                  view,
                  mesh,
                  face_color: [211, 84, 0, 75],
                  line_color: [186, 74, 0]
                )
              end
            end
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            result = @runtime.commands.execute(
              'CreateWardrobe',
              {
                origin_mm: @hover_point_mm || Core::Units.point_to_mm(@input_point.position),
                width_mm: @width_mm,
                height_mm: @height_mm,
                depth_mm: @depth_mm,
                door_type: @door_type
              },
              project_id: @runtime.project.project_id
            )

            if result[:status] == 'success'
              @runtime.active_model.select_tool(nil)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          rescue StandardError => e
            UI.messagebox("ConstructFlow Wardrobe error: #{e.message}")
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            bounds.add(@start_point) if defined?(@start_point) && @start_point
            bounds.add(Geom::Point3d.new(*Core::Units.point_from_mm(@hover_point_mm))) if @hover_point_mm
            bounds.add(@input_point.position) if @input_point&.valid?
            bounds
          end

          def deactivate(view)
            @start_point = nil if defined?(@start_point)
            @hover_point_mm = nil
            view.invalidate if view
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end
        end
      end
    end
  end
end
