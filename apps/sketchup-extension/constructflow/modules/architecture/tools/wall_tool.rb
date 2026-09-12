# frozen_string_literal: true

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
            @interaction = Core::PlanInteractionEngine.new(snap_tolerance_mm: snap_tolerance_mm)
            @references = PlanReferenceCollector.new(runtime)
            @input_point = Sketchup::InputPoint.new
            @start_point = nil
            @hover_point = nil
            @numeric_length_mm = nil
          end

          def activate
            Sketchup.status_text = 'ConstructFlow ผนังอัจฉริยะ (Plan Wall): คลิกจุดเริ่มต้น/สิ้นสุด. Shift สลับโหมดแกนตรง; Esc เพื่อยกเลิก'
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            if @input_point.valid?
              point_mm = @plane.project(Core::Units.point_to_mm(@input_point.position))
              if @start_point
                preview = @interaction.segment_preview(
                  @start_point, point_mm, mode: @constraint_mode, references: plan_references,
                  length_mm: @numeric_length_mm
                )
                @hover_point = point_from_mm(preview[:finish_mm])
                @preview = preview
              else
                snapped = @interaction.snap(point_mm, references: plan_references)
                @hover_point = point_from_mm(snapped[:point_mm])
                @preview = nil
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
              @start_point = @interaction.snap(
                @plane.project(Core::Units.point_to_mm(@input_point.position)), references: plan_references
              )[:point_mm]
              view.invalidate
              return
            end

            finish = @interaction.segment_preview(
              @start_point,
              @plane.project(Core::Units.point_to_mm(@input_point.position)),
              mode: @constraint_mode, references: plan_references, length_mm: @numeric_length_mm
            )[:finish_mm]
            if create_wall(@start_point, finish)
              @start_point = finish
              @numeric_length_mm = nil
              @preview = nil
            end
            view.invalidate
          end

          def draw(view)
            return unless @hover_point

            unless @start_point
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

            view.line_width = 2
            view.draw(GL_LINES, [start_pt, @hover_point])
            if @preview && view.respond_to?(:draw_text)
              label = format('L %.0f mm  ΔX %.0f  ΔY %.0f', @preview[:length_mm], @preview[:delta_x_mm], @preview[:delta_y_mm])
              view.draw_text(@hover_point, label)
            end
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            [@start_point, @hover_point].compact.each { |point_mm| bounds.add(point_from_mm(point_mm)) }
            bounds
          end

          def onKeyDown(key, repeat, _flags, view)
            return unless key == 16 && !repeat # Shift

            @constraint_mode = @constraint_mode == :free ? :orthogonal : :free
            Sketchup.status_text = "ConstructFlow Plan Wall: #{@constraint_mode} mode."
            view.invalidate
          end

          def enableVCB?
            true
          end

          def onUserText(text, view)
            @numeric_length_mm = @interaction.numeric_distance_mm(text)
            Sketchup.status_text = "ConstructFlow Plan Wall: #{@numeric_length_mm.round(1)} mm"
            view.invalidate
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end

          def onCancel(_reason, view)
            @start_point = nil
            @hover_point = nil
            @preview = nil
            @numeric_length_mm = nil
            view.invalidate
          end

          def deactivate(view)
            @start_point = nil
            @hover_point = nil
            @preview = nil
            @numeric_length_mm = nil
            view.invalidate if view
          end

          private

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
              UI.messagebox(result[:errors].join("\n"))
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