# frozen_string_literal: true

require_relative "../../../core/plan_interaction_engine"

module JiraNot
  module ConstructFlow
    module Architecture
      module Tools
        class WallTool
          def initialize(runtime:, thickness_mm:, height_mm:, level_id: nil, constraint_mode: :orthogonal,
                         snap_tolerance_mm: Core::PlanInteractionEngine::DEFAULT_SNAP_TOLERANCE_MM)
            @runtime = runtime
            @thickness_mm = Float(thickness_mm)
            @height_mm = Float(height_mm)
            @level_id = level_id.to_s.strip
            @level_id = nil if @level_id.empty?
            @plane = Core::PlanLevelContext.new(runtime, @level_id)
            @level_id = @plane.level_id
            @constraint_mode = constraint_mode.to_sym
            @locked_axis = nil
            @interaction = Core::PlanInteractionEngine.new(snap_tolerance_mm: snap_tolerance_mm)
            @references = PlanReferenceCollector.new(runtime)
            @input_point = Sketchup::InputPoint.new
            @start_input_point = nil
            @start_point = nil
            @first_point = nil
            @history = []
            @closing_loop = false
            @hover_point = nil
            @numeric_length_mm = nil
            @preview = nil
          end

          def activate
            @locked_axis = nil
            @numeric_length_mm = nil
            @start_point = nil
            @first_point = nil
            @history = []
            @closing_loop = false
            @start_input_point = nil
            @hover_point = nil
            @preview = nil
            Sketchup.set_status_text('ConstructFlow ผนัง [WA]: คลิกจุดแรก ➔ จุดถัดไป • [ลูกศร: ล็อกแกน | VCB: พิมพ์ความยาว | Backspace: ย้อน 1 จุด | คลิกจุดแรก: ปิดห้อง]', (defined?(SB_PROMPT) ? SB_PROMPT : nil))
            Sketchup.set_status_text('ความยาว (Length)', SB_VCB_LABEL) if defined?(SB_VCB_LABEL)
            Sketchup.set_status_text('', SB_VCB_VALUE) if defined?(SB_VCB_VALUE)
          end

          def onMouseMove(_flags, x, y, view)
            if @start_point && @start_input_point
              @input_point.pick(view, x, y, @start_input_point)
            else
              @input_point.pick(view, x, y)
            end

            if @input_point.valid?
              point_mm = @plane.project(Core::Units.point_to_mm(@input_point.position))
              if @start_point
                # Auto-close loop detection if near first point
                if @history.length >= 2 && @first_point
                  dist_to_first = Math.sqrt((point_mm[0] - @first_point[0])**2 + (point_mm[1] - @first_point[1])**2)
                  if dist_to_first <= (@interaction.snap_tolerance_mm * 1.5)
                    point_mm = @first_point
                    @closing_loop = true
                  else
                    @closing_loop = false
                  end
                else
                  @closing_loop = false
                end

                mode = current_constraint_mode
                preview = @interaction.segment_preview(
                  @start_point, point_mm, mode: mode, references: plan_references,
                  length_mm: @numeric_length_mm
                )
                @hover_point = point_from_mm(preview[:finish_mm])
                @preview = preview

                if defined?(SB_VCB_LABEL)
                  Sketchup.set_status_text('ความยาว (Length)', SB_VCB_LABEL)
                  Sketchup.set_status_text(format('%.1f mm', preview[:length_mm]), SB_VCB_VALUE)
                end
              else
                snapped = @interaction.snap(point_mm, references: plan_references)
                @hover_point = point_from_mm(snapped[:point_mm])
                @preview = nil
                if defined?(SB_VCB_LABEL)
                  Sketchup.set_status_text('ความยาว (Length)', SB_VCB_LABEL)
                  Sketchup.set_status_text('', SB_VCB_VALUE)
                end
              end
            else
              @hover_point = nil
              @preview = nil
            end
            view.invalidate
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            unless @input_point.valid?
              @hover_point = nil
              @preview = nil
              view.invalidate
              return
            end

            if @start_point.nil?
              snapped_pt = @interaction.snap(
                @plane.project(Core::Units.point_to_mm(@input_point.position)), references: plan_references
              )[:point_mm]
              @start_point = snapped_pt
              @first_point = snapped_pt
              @history = []
              @closing_loop = false
              @start_input_point = Sketchup::InputPoint.new(@input_point.position)
              Sketchup.status_text = 'ConstructFlow Plan Wall: คลิกจุดปลาย หรือ พิมพ์ความยาวใน VCB แล้วกด Enter (Backspace: ย้อนจุด, ลูกศร: ล็อคแกน)'
              view.invalidate
              return
            end

            finish = if @closing_loop && @first_point
                       @first_point
                     else
                       @interaction.segment_preview(
                         @start_point,
                         @plane.project(Core::Units.point_to_mm(@input_point.position)),
                         mode: current_constraint_mode, references: plan_references, length_mm: @numeric_length_mm
                       )[:finish_mm]
                     end

            if create_wall(@start_point, finish)
              @history << { start: @start_point, finish: finish }
              if @closing_loop
                # Loop successfully closed! Reset tool state
                @start_point = nil
                @first_point = nil
                @start_input_point = nil
                @history = []
                @closing_loop = false
                @numeric_length_mm = nil
                @preview = nil
                Sketchup.status_text = '🎉 ปิดลูปห้องและสร้างผนังสำเร็จ (Room Loop Closed)! คลิกเพื่อเริ่มแนวผนังใหม่'
              else
                @start_point = finish
                @start_input_point = Sketchup::InputPoint.new(point_from_mm(finish))
                @numeric_length_mm = nil
                @preview = nil
              end
            end
            view.invalidate
          end

          def draw(view)
            return unless @hover_point

            unless @start_point
              @input_point.draw(view) if @input_point&.valid?
              view.draw_points([@hover_point], 8, 1, 'cyan') if view.respond_to?(:draw_points)
              view.draw_text(@hover_point, 'Click to start Smart Wall') if view.respond_to?(:draw_text)
              return
            end

            start_pt = point_from_mm(@start_point)
            if defined?(Core::GhostPreview)
              mesh = Core::GhostPreview.build_wall_mesh(start_pt, @hover_point, @thickness_mm, @height_mm)
              if mesh
                Core::GhostPreview.render_ghost(
                  view,
                  mesh,
                  face_color: [52, 152, 219, 75],
                  line_color: [41, 128, 185],
                  centerlines: mesh[:centerlines]
                )
              end
            end

            # Visual axis indicators & guide lines
            line_color = 'blue'
            axis_label = ''
            if @preview
              dx = @preview[:delta_x_mm]
              dy = @preview[:delta_y_mm]
              if @locked_axis == :red || (dy.abs <= 0.001 && dx.abs > 0.001)
                line_color = 'red'
                axis_label = ' [แกนแดง X]'
                if view.respond_to?(:line_stipple=)
                  p1 = Geom::Point3d.new(start_pt.x - 50.m, start_pt.y, start_pt.z)
                  p2 = Geom::Point3d.new(start_pt.x + 50.m, start_pt.y, start_pt.z)
                  view.drawing_color = 'red'
                  view.line_stipple = '_'
                  view.draw(GL_LINES, [p1, p2])
                  view.line_stipple = ''
                end
              elsif @locked_axis == :green || (dx.abs <= 0.001 && dy.abs > 0.001)
                line_color = 'green'
                axis_label = ' [แกนเขียว Y]'
                if view.respond_to?(:line_stipple=)
                  p1 = Geom::Point3d.new(start_pt.x, start_pt.y - 50.m, start_pt.z)
                  p2 = Geom::Point3d.new(start_pt.x, start_pt.y + 50.m, start_pt.z)
                  view.drawing_color = 'green'
                  view.line_stipple = '_'
                  view.draw(GL_LINES, [p1, p2])
                  view.line_stipple = ''
                end
              elsif @locked_axis == :blue
                line_color = 'blue'
                axis_label = ' [แกนน้ำเงิน Z]'
              end
            end

            view.line_width = 3
            view.drawing_color = line_color
            view.draw(GL_LINES, [start_pt, @hover_point])
            @input_point.draw(view) if @input_point&.valid?

            if @closing_loop && @first_point && view.respond_to?(:draw_points)
              first_pt = point_from_mm(@first_point)
              view.draw_points([first_pt], 14, 2, 'gold')
              view.draw_text(first_pt, ' 🔒 คลิกเพื่อปิดลูปห้อง (Close Loop)') if view.respond_to?(:draw_text)
            end

            if @preview && view.respond_to?(:draw_text)
              label = format('L %.0f mm%s  ΔX %.0f  ΔY %.0f', @preview[:length_mm], axis_label, @preview[:delta_x_mm], @preview[:delta_y_mm])
              # High-contrast text with dark shadow halo
              screen = view.respond_to?(:screen_coords) ? view.screen_coords(@hover_point) : @hover_point
              [-1, 1].each do |ox|
                [-1, 1].each do |oy|
                  view.draw_text(Geom::Point3d.new(screen.x + ox, screen.y + oy, 0), label, color: 'black') rescue nil
                end
              end
              view.draw_text(screen, label, color: 'white') rescue nil
            end
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            [@start_point, @hover_point].compact.each { |point_mm| bounds.add(point_from_mm(point_mm)) }
            bounds
          end

          def onKeyDown(key, repeat, _flags, view)
            if key == 8 && !repeat # Backspace: Undo last point
              if @history.any?
                last_seg = @history.pop
                @start_point = last_seg[:start]
                @start_input_point = Sketchup::InputPoint.new(point_from_mm(@start_point))
                if @history.empty?
                  @first_point = nil
                  @start_point = nil
                  @start_input_point = nil
                end
                @closing_loop = false
                @numeric_length_mm = nil
                @preview = nil
                Sketchup.status_text = 'ConstructFlow Plan Wall: ย้อนกลับ 1 จุด (Undid last point)'
                view&.invalidate
                return
              end
            end
            if (key == 39 || (defined?(VK_RIGHT) && key == VK_RIGHT)) && !repeat
              @locked_axis = @locked_axis == :red ? nil : :red
              msg = @locked_axis ? '🔒 ล็อคแกนแดง X (Red Axis Locked)' : 'ปลดล็อคแกน (Axis Unlocked)'
              Sketchup.status_text = msg
              view.invalidate
              return
            elsif (key == 37 || (defined?(VK_LEFT) && key == VK_LEFT)) && !repeat
              @locked_axis = @locked_axis == :green ? nil : :green
              msg = @locked_axis ? '🔒 ล็อคแกนเขียว Y (Green Axis Locked)' : 'ปลดล็อคแกน (Axis Unlocked)'
              Sketchup.status_text = msg
              view.invalidate
              return
            elsif (key == 38 || (defined?(VK_UP) && key == VK_UP)) && !repeat
              @locked_axis = @locked_axis == :blue ? nil : :blue
              msg = @locked_axis ? '🔒 ล็อคแกนน้ำเงิน Z (Blue Axis Locked)' : 'ปลดล็อคแกน (Axis Unlocked)'
              Sketchup.status_text = msg
              view.invalidate
              return
            elsif (key == 40 || (defined?(VK_DOWN) && key == VK_DOWN)) && !repeat
              @locked_axis = nil
              @constraint_mode = :orthogonal
              Sketchup.status_text = 'ปลดล็อคแกน (Orthogonal Mode)'
              view.invalidate
              return
            end
            if defined?(Core::ShortcutManager) && Core::ShortcutManager.handle_key(key, @runtime, view)
              return
            end

            return unless key == 16 && !repeat # Shift

            @constraint_mode = @constraint_mode == :free ? :orthogonal : :free
            Sketchup.status_text = "ConstructFlow Plan Wall: #{@constraint_mode} mode."
            view.invalidate
          end

          def enableVCB?
            true
          end

          def onUserText(text, view)
            length_mm = @interaction.numeric_distance_mm(text)
            @numeric_length_mm = length_mm

            unless @start_point
              Sketchup.status_text = "ConstructFlow Plan Wall: กำหนดความยาว #{length_mm.round(1)} mm (คลิกจุดเริ่มต้นเพื่อเริ่มวาดผนัง)"
              view.invalidate
              return
            end

            target_candidate = if @hover_point
                                 @plane.project(Core::Units.point_to_mm(@hover_point))
                               else
                                 [@start_point[0] + 100.0, @start_point[1], @start_point[2]]
                               end

            preview = @interaction.segment_preview(
              @start_point, target_candidate, mode: current_constraint_mode, references: plan_references,
              length_mm: length_mm
            )
            finish = preview[:finish_mm]

            if create_wall(@start_point, finish)
              @start_point = finish
              @start_input_point = Sketchup::InputPoint.new(point_from_mm(finish))
              @numeric_length_mm = nil
              @preview = nil
              Sketchup.status_text = "สร้างผนังความยาว #{length_mm.round(1)} mm สำเร็จ (คลิกหรือพิมพ์ความยาวสำหรับช่วงถัดไป)"
              Sketchup.set_status_text('', SB_VCB_VALUE) if defined?(SB_VCB_VALUE)
            end
            view.invalidate
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end

          def onCancel(_reason, view)
            @start_point = nil
            @first_point = nil
            @history = []
            @closing_loop = false
            @start_input_point = nil
            @hover_point = nil
            @preview = nil
            @numeric_length_mm = nil
            @locked_axis = nil
            view.invalidate
          end

          def deactivate(view)
            @start_point = nil
            @first_point = nil
            @history = []
            @closing_loop = false
            @start_input_point = nil
            @hover_point = nil
            @preview = nil
            @numeric_length_mm = nil
            @locked_axis = nil
            view.invalidate if view
          end

          private

          def current_constraint_mode
            case @locked_axis
            when :red then :axis_x
            when :green then :axis_y
            when :blue then :axis_z
            else @constraint_mode
            end
          end

          def create_wall(start_point, finish_point)
            path = [start_point, finish_point].map { |point| Array(point).map(&:to_f) }
            if @level_id
              level = @runtime.levels.fetch(@level_id)
              if level.elevation_mm.nil?
                UI.messagebox("Level #{@level_id} has no confirmed elevation.")
                return false
              end
              path.each { |point| point[2] = level.elevation_mm }
            end

            result = @runtime.commands.execute(
              'CreateWall',
              {
                path_mm: path,
                thickness_mm: @thickness_mm,
                height_mm: @height_mm,
                level_id: @level_id
              },
              project_id: @runtime.project.project_id
            )

            if result[:status] == 'success'
              refresh_plan
              true
            else
              UI.messagebox(result[:errors].join("
"))
              false
            end
          rescue StandardError => error
            UI.messagebox("ConstructFlow Wall error: #{error.message}")
            false
          end

          def point_from_mm(point_mm)
            values = Core::Units.point_from_mm(point_mm)
            Geom::Point3d.new(*values)
          end

          def plan_references
            @references.paths(level_id: @level_id)
          end

          def refresh_plan
            return unless @runtime.respond_to?(:plan_scenes)

            @runtime.plan_scenes.refresh_preset('architecture.construction')
          rescue StandardError => error
            Sketchup.status_text = "Wall created; plan refresh pending: #{error.message}"
          end
        end
      end
    end
  end
end
