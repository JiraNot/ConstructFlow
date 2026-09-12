# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Tools
        class WallTool
          def initialize(runtime:, thickness_mm:, height_mm:, level_id: nil)
            @runtime = runtime
            @thickness_mm = Float(thickness_mm)
            @height_mm = Float(height_mm)
            @level_id = level_id.to_s.strip
            @level_id = nil if @level_id.empty?
            @input_point = Sketchup::InputPoint.new
            @start_point = nil
            @hover_point = nil
          end

          def activate
            Sketchup.status_text = 'ConstructFlow ผนังอัจฉริยะ: คลิกจุดเริ่มต้น จากนั้นคลิกจุดสิ้นสุด (Esc เพื่อยกเลิก)'
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            @hover_point = @input_point.position if @input_point.valid?
            view.invalidate
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            if @start_point.nil?
              @start_point = @input_point.position
              view.invalidate
              return
            end

            finish = @input_point.position
            create_wall(@start_point, finish)
            @start_point = finish
            view.invalidate
          end

          def draw(view)
            return unless @start_point && @hover_point

            view.line_width = 2
            view.draw(GL_LINES, [@start_point, @hover_point])
          end

          def onCancel(_reason, view)
            @start_point = nil
            @hover_point = nil
            view.invalidate
          end

          private

          def create_wall(start_point, finish_point)
            path = [start_point, finish_point].map { |point| Core::Units.point_to_mm(point) }
            if @level_id
              level = @runtime.levels.fetch(@level_id)
              if level.elevation_mm.nil?
                UI.messagebox("Level #{@level_id} has no confirmed elevation.")
                return
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

            UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
          end
        end
      end
    end
  end
end
