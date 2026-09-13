# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module Tools
        class SpotElevationTool
          TAG_NAME = 'CF_LEVELS'

          def initialize(runtime = nil)
            @runtime = runtime
            @input_point = defined?(Sketchup::InputPoint) ? Sketchup::InputPoint.new : nil
            @benchmark_z = 0.0 # Default benchmark is Z = 0
            @hover_point = nil
          end

          def activate
            msg = "🎯 Spot Elevation: คลิกบนพื้นผิวเพื่อปักหมุดระดับ (หรือกด Ctrl เพื่อตั้งจุดนี้เป็น Benchmark ±0.00)"
            defined?(Sketchup.set_status_text) && Sketchup.set_status_text(msg, (defined?(SB_PROMPT) ? SB_PROMPT : nil))
          end

          def deactivate(view)
            view.invalidate if view
          end

          def onMouseMove(flags, x, y, view)
            return unless @input_point
            @input_point.pick(view, x, y)
            if @input_point.valid?
              @hover_point = @input_point.position
              z_m = (@hover_point.z - @benchmark_z).to_m
              elev_str = format_elevation(z_m)
              msg = "🎯 ระดับ: #{elev_str} | คลิกเพื่อปักหมุดระดับบนแบบ"
              defined?(Sketchup.set_status_text) && Sketchup.set_status_text(msg, (defined?(SB_PROMPT) ? SB_PROMPT : nil))
            end
            view.invalidate
          end

          def onLButtonDown(flags, x, y, view)
            return unless @input_point&.valid?
            pt = @input_point.position
            model = view.model

            # If Ctrl is pressed, set this as Benchmark
            if (flags & 8) == 8 # COPY_MODIFIER_MASK / CTRL
              @benchmark_z = pt.z
              defined?(UI.messagebox) && UI.toast("ตั้งระดับอ้างอิง Benchmark ±0.00 เรียบร้อย", level: 'info') rescue nil
              return
            end

            model.start_operation('Place Spot Elevation Marker', true)
            begin
              layer = model.layers[TAG_NAME] || model.layers.add(TAG_NAME)
              
              z_m = (pt.z - @benchmark_z).to_m
              label = determine_label(pt, z_m)

              # Add text leader
              # Vector pointing diagonally up and right
              vec = Geom::Vector3d.new(200.mm, 200.mm, 150.mm)
              txt = model.active_entities.add_text(label, pt, vec)
              if txt
                txt.layer = layer if txt.respond_to?(:layer=)
              end

              model.commit_operation
            rescue StandardError => e
              model.abort_operation
            end
            view.invalidate
          end

          def draw(view)
            return unless @hover_point
            view.drawing_color = 'red'
            view.line_width = 2
            # Draw a small 3D target crosshair
            size = 100.mm
            p1 = @hover_point.offset(Geom::Vector3d.new(-size, 0, 0))
            p2 = @hover_point.offset(Geom::Vector3d.new(size, 0, 0))
            p3 = @hover_point.offset(Geom::Vector3d.new(0, -size, 0))
            p4 = @hover_point.offset(Geom::Vector3d.new(0, size, 0))
            view.draw_lines([p1, p2, p3, p4])
          end

          private

          def format_elevation(z_m)
            if z_m.abs < 0.001
              '±0.000 ม.'
            elsif z_m > 0
              format('+%.3f ม.', z_m)
            else
              format('%.3f ม.', z_m)
            end
          end

          def determine_label(pt, z_m)
            formatted = format_elevation(z_m)
            if z_m.abs < 0.001
              "▼ FL. #{formatted} (ระดับพื้นอ้างอิง)"
            elsif z_m < -0.25
              "▼ GL. #{formatted} (ระดับดิน/สวน)"
            elsif z_m < 0.0
              "▼ FL. #{formatted} (พื้นลดระดับ)"
            elsif z_m > 2.0
              "▼ TOP OF BEAM #{formatted}"
            else
              "▼ FL. #{formatted}"
            end
          end
        end
      end
    end
  end
end
