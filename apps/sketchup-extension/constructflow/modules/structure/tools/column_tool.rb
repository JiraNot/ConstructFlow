# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      module Tools
        class ColumnTool
          def initialize(runtime:, section_mm:, base_level_id:, top_level_id:,
                         base_offset_mm: 0, top_offset_mm: 0, explicit_height_mm: 2800, anchor: :center, profile_code: nil)
            @runtime = runtime
            @section_mm = section_mm
            @anchor = (anchor || :center).to_sym
            @profile_code = profile_code&.to_s
            @base_level_id = base_level_id.to_s
            @top_level_id = top_level_id.to_s
            @base_offset_mm = Float(base_offset_mm)
            @plane = Core::PlanLevelContext.new(runtime, @base_level_id, offset_mm: @base_offset_mm)
            @base_level_id = @plane.level_id.to_s
            @top_offset_mm = Float(top_offset_mm)
            @explicit_height_mm = Float(explicit_height_mm)
            @input_point = Sketchup::InputPoint.new
            @interaction = Core::PlanInteractionEngine.new
            @selection_filter = Core::PlanSelectionFilter.new(object_types: ['structure.column'])
            @references = Architecture::PlanReferenceCollector.new(runtime)
            @hover_mm = nil
            @rotation_deg = 0.0
          end

          def activate
            Sketchup.set_status_text('ConstructFlow เสา [CL]: คลิกตำแหน่งกึ่งกลางเพื่อวางเสา • [R: หมุน 90° | VCB: พิมพ์ขนาด เช่น 0.40,0.40 | ลูกศร: ล็อกแกน | Esc: ยกเลิก]', (defined?(SB_PROMPT) ? SB_PROMPT : nil))
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            @hover_mm = if @input_point.valid?
                          @interaction.snap(
                            @plane.project(Core::Units.point_to_mm(@input_point.position)), references: @references.paths(level_id: @base_level_id)
                          )[:point_mm]
                        else
                          nil
                        end
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?
            if @hover_mm && view.respond_to?(:draw_points)
              x, y, z = Core::Units.point_from_mm(@hover_mm)
              pt = Geom::Point3d.new(x, y, z)
              view.draw_points([pt], 10, 1, 'orange')
              screen = view.respond_to?(:screen_coords) ? view.screen_coords(pt) : nil
              view.draw_text(Geom::Point3d.new(screen.x, screen.y, 0), 'Column snap') if screen && view.respond_to?(:draw_text)
            end

            if @input_point.valid? && defined?(Core::GhostPreview)
              preview_point = if @hover_mm
                                Geom::Point3d.new(*Core::Units.point_from_mm(@hover_mm))
                              else
                                @input_point.position
                              end
              mesh = Core::GhostPreview.build_column_mesh(preview_point, @section_mm, @explicit_height_mm)
              if mesh
                Core::GhostPreview.render_ghost(
                  view,
                  mesh,
                  face_color: [26, 188, 156, 80],
                  line_color: [22, 160, 133]
                )
              end
            end
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            if @hover_mm
              values = Core::Units.point_from_mm(@hover_mm)
              bounds.add(Geom::Point3d.new(*values))
            end
            bounds.add(@input_point.position) if @input_point&.valid?
            bounds
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            point_mm = @hover_mm || @plane.project(Core::Units.point_to_mm(@input_point.position))
            input = {
              location_mm: point_mm,
              section_mm: @section_mm,
              base_offset_mm: @base_offset_mm,
              top_offset_mm: @top_offset_mm
            }
            input[:base_level_id] = @base_level_id unless @base_level_id.empty?
            input[:top_level_id] = @top_level_id unless @top_level_id.empty?
            if @top_level_id.empty?
              input[:base_elevation_mm] = point_mm[2] if @base_level_id.empty?
              input[:top_elevation_mm] = (input[:base_elevation_mm] || point_mm[2]) + @explicit_height_mm
            end

            result = @runtime.commands.execute(
              'CreateColumn', input, project_id: @runtime.project.project_id
            )
            if result[:status] == 'success'
              view.invalidate
              Sketchup.set_status_text('Column placed. Click again or Esc to finish.', SB_PROMPT)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          rescue StandardError => error
            UI.messagebox("ConstructFlow Structure error: #{error.message}")
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end

          def enableVCB?
            true
          end

          def onKeyDown(key, repeat, _flags, view)
            if (key == 82 || key == 114) && !repeat # R key: Rotate section 90 degrees
              @section_mm = [@section_mm[1], @section_mm[0]]
              @rotation_deg = (@rotation_deg || 0.0) + 90.0
              Sketchup.set_status_text("ConstructFlow เสาโครงสร้าง: หมุนเสา 90° ขนาด #{@section_mm.map { |value| Core::Units.format_dimension(value) }.join(' × ')} (R เพื่อหมุนต่อ)", (defined?(SB_PROMPT) ? SB_PROMPT : nil))
              view&.invalidate
              return
            end

            if defined?(Core::ShortcutManager) && Core::ShortcutManager.handle_key(key, @runtime, view)
              return
            end
          end

          def onUserText(text, view)
            parts = text.to_s.strip.split(/[,xX*]/).map(&:strip).reject(&:empty?)
            raise ArgumentError, 'กรอกหน้าตัดเป็นเมตร เช่น 0.20 หรือ 0.20,0.20' unless (1..2).cover?(parts.length)
            raise ArgumentError, 'ขนาดหน้าตัดต้องไม่เกิน 20 เมตร' if parts.any? { |value| Float(value) > 20.0 }

            dimensions_mm = parts.map { |value| Core::Units.m_input_to_mm(value, max_meters: 20.0) }
            unless dimensions_mm.all?(&:positive?)
              raise ArgumentError, 'หน้าตัดเสาต้องมากกว่า 0'
            end

            @section_mm = dimensions_mm.length == 1 ? [dimensions_mm[0], dimensions_mm[0]] : dimensions_mm
            Sketchup.set_status_text("กำหนดขนาดหน้าตัดเสา: #{@section_mm.map { |value| Core::Units.format_dimension(value) }.join(' × ')} (คลิกเพื่อวาง)", (defined?(SB_PROMPT) ? SB_PROMPT : nil))
            view&.invalidate
          rescue StandardError => e
            UI.messagebox("ขนาดเสาไม่ถูกต้อง: #{e.message}") if defined?(UI) && UI.respond_to?(:messagebox)
          end

          def deactivate(view)
            @hover_mm = nil
            @rotation_deg = 0.0
            view.invalidate if view
          end
        end
      end
    end
  end
end
