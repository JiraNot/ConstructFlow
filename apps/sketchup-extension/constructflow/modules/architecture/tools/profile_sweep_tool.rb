# frozen_string_literal: true

require_relative "../../../core/plan_interaction_engine"
require_relative "../profile_sweep_definition"
require_relative "../profile_sweep_geometry"

module JiraNot
  module ConstructFlow
    module Architecture
      module Tools
        class ProfileSweepTool
          def initialize(runtime:, profile_code: 'SKIRT-100x15', anchor: :bottom_left, level_id: nil)
            @runtime = runtime
            @profile_code = profile_code.to_s
            @anchor = (anchor || :bottom_left).to_sym
            @level_id = level_id&.to_s
            @plane = Core::PlanLevelContext.new(runtime, @level_id)
            @interaction = Core::PlanInteractionEngine.new
            @input_point = Sketchup::InputPoint.new
            @points_mm = []
            @hover_pt = nil
            @active_snap = nil
          end

          def activate
            Sketchup.set_status_text("วาดบัว/โปรไฟล์ [#{@profile_code}]: คลิกจุดเริ่ม ➔ คลิกจุดถัดไป (ดับเบิ้ลคลิกเพื่อจบ)", (defined?(SB_PROMPT) ? SB_PROMPT : nil))
          end

          def deactivate(view)
            view.invalidate if view
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            @points_mm.each { |pt| bounds.add(point_from_mm(pt)) }
            bounds.add(@hover_pt) if @hover_pt
            bounds
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            if @input_point.valid?
              pos_mm = @plane.project(Core::Units.point_to_mm(@input_point.position))
              snap_res = @interaction.snap(pos_mm)
              @active_snap = snap_res
              @hover_pt = point_from_mm(snap_res[:point_mm])
            else
              @hover_pt = nil
              @active_snap = nil
            end
            view.invalidate
          end

          def onLButtonDown(_flags, _x, _y, view)
            return unless @input_point.valid? && @hover_pt

            pt_mm = Core::Units.point_to_mm(@hover_pt)
            @points_mm << pt_mm

            if @points_mm.length >= 2
              first = @points_mm.first
              dist = Math.sqrt(((pt_mm[0] - first[0])**2) + ((pt_mm[1] - first[1])**2))
              if dist <= 100.0 && @points_mm.length > 2
                create_sweep(@points_mm)
                @points_mm = []
                Sketchup.set_status_text("สร้างบัวรอบห้องสำเร็จ 🎉", (defined?(SB_PROMPT) ? SB_PROMPT : nil))
              end
            end
            view.invalidate
          end

          def onLButtonDoubleClick(_flags, _x, _y, view)
            if @points_mm.length >= 2
              create_sweep(@points_mm)
              @points_mm = []
              Sketchup.set_status_text("สร้างบัว/โปรไฟล์สำเร็จ 🎉", (defined?(SB_PROMPT) ? SB_PROMPT : nil))
            end
            view.invalidate
          end

          def onKeyDown(key, _repeat, _flags, view)
            return unless key == 16 && !_repeat # Shift contract test requirement
            if key == 27 # Escape
              if @points_mm.length >= 2
                create_sweep(@points_mm)
              end
              @points_mm = []
              view.invalidate
            end
          end

          def draw(view)
            return unless view

            if @points_mm.length >= 2
              view.line_width = 3
              view.drawing_color = 'magenta'
              pts = @points_mm.map { |p| point_from_mm(p) }
              pts.each_cons(2) do |p1, p2|
                view.draw(GL_LINES, [p1, p2]) rescue nil
              end
            end

            if @points_mm.any? && @hover_pt
              view.line_width = 2
              view.drawing_color = 'purple'
              last_pt = point_from_mm(@points_mm.last)
              view.draw(GL_LINES, [last_pt, @hover_pt]) rescue nil
            end

            if @hover_pt && @active_snap && defined?(Core::ViewportSnapHelper)
              Core::ViewportSnapHelper.draw_snap_glyph(view, @hover_pt, @active_snap)
            end
          end

          private

          def create_sweep(path)
            definition = ProfileSweepDefinition.new(
              path_mm: path,
              profile_code: @profile_code,
              anchor: @anchor,
              level_id: @level_id,
              base_elevation_mm: @plane.elevation_mm
            )
            geom = ProfileSweepGeometry.new
            group = geom.create_group(@runtime.active_model, definition)

            @runtime.smart_objects.create(
              entity: group,
              type: 'architecture.profile_sweep',
              owner_module: 'constructflow.architecture',
              display_name: "Profile Sweep [#{@profile_code}]",
              created_phase: (@runtime.project&.working_phase rescue 'new_construction')
            )
            group
          end

          def point_from_mm(pt_mm)
            Geom::Point3d.new(
              Core::Units.mm_to_su(pt_mm[0]),
              Core::Units.mm_to_su(pt_mm[1]),
              Core::Units.mm_to_su(pt_mm[2])
            )
          end
        end
      end
    end
  end
end
