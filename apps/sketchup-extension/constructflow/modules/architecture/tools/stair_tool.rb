# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Tools
        class StairTool
          def initialize
            @state = :start
            @start_point = nil
            @direction = nil
          end

          def activate
            Sketchup.active_model.selection.clear
            update_status_text
          end

          def onLButtonDown(flags, x, y, view)
            ip = view.inputpoint(x, y)
            return unless ip.valid?
            
            if @state == :start
              @start_point = ip.position
              @state = :direction
            elsif @state == :direction
              @direction = @start_point.vector_to(ip.position)
              if @direction.valid? && @direction.length > 0
                create_stair(view)
                reset
              end
            end
            update_status_text
          end

          def onMouseMove(flags, x, y, view)
            if @state == :direction
              ip = view.inputpoint(x, y)
              return unless ip.valid?
              view.tooltip = "Direction"
              view.invalidate
            end
          end
          
          def draw(view)
            if @state == :direction && @start_point
              # basic preview
              view.draw_points([@start_point], 10, 1, 'red')
            end
          end

          def deactivate(view)
            reset
            view.invalidate if view
          end

          def getExtents
            bb = Geom::BoundingBox.new
            bb.add(@start_point) if @start_point
            bb
          end

          def onCancel(reason, view)
            reset
            update_status_text
          end

          private

          def reset
            @state = :start
            @start_point = nil
            @direction = nil
          end
          
          def update_status_text
            msg = @state == :start ? "Click to set stair start point" : "Click to set stair direction"
            Sketchup.status_text = msg
          end
          
          def create_stair(view)
            model = Sketchup.active_model
            model.start_operation('Create Staircase', true)
            
            def_params = {
              start_point: @start_point.to_a,
              direction: @direction.to_a
            }
            
            definition = StairDefinition.new(**def_params)
            geom = StairGeometry.new(definition)
            
            group = geom.generate(model.active_entities)
            
            repo = StairRepository.new
            repo.save(group, definition)
            
            model.commit_operation
          end
        end
      end
    end
  end
end
