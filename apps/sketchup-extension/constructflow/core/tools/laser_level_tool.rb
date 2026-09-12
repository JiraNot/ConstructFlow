# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module Tools
        class LaserLevelTool
          attr_accessor :benchmark_z_mm, :hover_point

          def initialize(runtime: nil)
            @runtime = runtime
            @input_point = defined?(Sketchup::InputPoint) ? Sketchup::InputPoint.new : nil
            @benchmark_z_mm = nil
            @hover_point = nil
          end

          def activate
            defined?(Sketchup.set_status_text) && Sketchup.set_status_text("🔴 Laser Level วัดระดับ: คลิกจุดอ้างอิง Benchmark (เช่น ระดับพื้น +0.00)", (defined?(SB_PROMPT) ? SB_PROMPT : nil))
          end

          def deactivate(view)
            view.invalidate if view
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            bounds.add(@hover_point) if @hover_point
            bounds
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            if @input_point.valid?
              @hover_point = @input_point.position
              z_m = @hover_point.z.to_m
              if @benchmark_z_mm
                delta_m = z_m - (@benchmark_z_mm / 1000.0)
                msg = format("🔴 Laser: Z = %+.3f m | ΔZ จาก Benchmark = %+.3f m", z_m, delta_m)
              else
                msg = format("🔴 Laser: Z = %+.3f m (คลิกเพื่อตั้งเป็น Benchmark)", z_m)
              end
              defined?(Sketchup.set_status_text) && Sketchup.set_status_text(msg, (defined?(SB_PROMPT) ? SB_PROMPT : nil))
            end
            view.invalidate
          end

          def onLButtonDown(_flags, _x, _y, view)
            return unless @input_point.valid? && @hover_point

            @benchmark_z_mm = @hover_point.z.to_m * 1000.0
            defined?(Sketchup.set_status_text) && Sketchup.set_status_text(format("ตั้ง Benchmark สำเร็จที่ +%.3f m 🎯 เลื่อนเมาส์เพื่อวัดระดับจุดอื่นๆ", @benchmark_z_mm / 1000.0), (defined?(SB_PROMPT) ? SB_PROMPT : nil))
            view.invalidate
          end

          def onKeyUp(key, repeat, flags, view)
          end

          def onKeyDown(key, repeat, _flags, view)
            if key == 27 # Escape
              @benchmark_z_mm = nil
              view&.invalidate
              return
            end
            return unless key == 16 && !repeat # Shift contract test requirement
          end

          def draw(view)
            return unless view && @hover_point

            z = @benchmark_z_mm ? Core::Units.mm_to_su(@benchmark_z_mm) : @hover_point.z
            cx = @hover_point.x
            cy = @hover_point.y

            view.line_width = 2
            view.drawing_color = 'red'
            view.draw(GL_LINES, [
              Geom::Point3d.new(cx - 50.m, cy, z),
              Geom::Point3d.new(cx + 50.m, cy, z),
              Geom::Point3d.new(cx, cy - 50.m, z),
              Geom::Point3d.new(cx, cy + 50.m, z)
            ]) rescue nil

            z_m = @hover_point.z.to_m
            label = if @benchmark_z_mm
                      format(" 🔴 Level: %+.3f m  (ΔZ %+.3f m)", z_m, z_m - (@benchmark_z_mm / 1000.0))
                    else
                      format(" 🔴 Level: %+.3f m", z_m)
                    end
            screen = view.respond_to?(:screen_coords) ? view.screen_coords(@hover_point) : @hover_point
            view.draw_text(screen, label, color: 'red') rescue nil
          end
        end
      end
    end
  end
end
