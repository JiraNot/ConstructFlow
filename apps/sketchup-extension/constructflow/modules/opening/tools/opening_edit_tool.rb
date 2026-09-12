# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Opening
      module Tools
        class OpeningEditTool
          PICK_THRESHOLD_PX = 18.0

          def initialize(runtime:, level_id: nil)
            @runtime = runtime
            @repository = OpeningRepository.new
            @host_capability = runtime.capabilities.fetch('wall.host_surface')
            @active_level_id = level_id.to_s.strip
            @active_level_id = nil if @active_level_id.empty?
            @plane = Core::PlanLevelContext.new(runtime, @active_level_id)
            @active_level_id = @plane.level_id
            @selection_filter = Core::PlanSelectionFilter.new(object_types: ['architecture.wall'], level_id: @active_level_id)
            @interaction = Core::PlanInteractionEngine.new
            @input_point = Sketchup::InputPoint.new
            @opening = nil
            @definition = nil
            @host = nil
            @hover_opening = nil
            @hover_definition = nil
            @hover_host = nil
            @hover_host_definition = nil
            @preview = nil
          end

          def activate
            Sketchup.set_status_text(
              'ConstructFlow Plan Opening Edit: click an opening, drag along its host wall. Esc cancels.',
              SB_PROMPT
            )
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            unless @opening
              set_hover_state(view, x, y)
              return view.invalidate
            end

            return view.invalidate unless @opening && @host && @input_point.valid?

            point_mm = @plane.project(Core::Units.point_to_mm(@input_point.position))
            snapped = @interaction.snap(
              point_mm,
              references: [{ path_mm: @host_definition.centerline_path_mm, kind: 'host_wall' }]
            )
            placement = @host_capability.locate(@host, snapped[:point_mm])
            @preview = @definition.with(
              segment_index: placement[:segment_index],
              start_offset_mm: placement[:distance_along_mm] - (@definition.width_mm / 2.0)
            )
            view.invalidate
          rescue StandardError
            @preview = nil
            view.invalidate
          end

          def onLButtonDown(_flags, x, y, view)
            return if @opening

            @input_point.pick(view, x, y)
            opening = pick_opening(view, x, y)
            unless opening
              Sketchup.set_status_text('Pick a ConstructFlow hosted Opening.', SB_PROMPT)
              return
            end

            definition = @repository.read(opening.entity)
            host = definition && @runtime.smart_objects.fetch_by_id(definition.host_object_id)
            unless definition && @host_capability.compatible_host?(host)
              Sketchup.set_status_text('Opening host is unresolved or incompatible.', SB_PROMPT)
              return
            end

            @opening = opening
            @definition = definition
            @host = host
            clear_hover_state
            @preview = definition
            Sketchup.set_status_text('Drag opening along host wall; release to commit.', SB_PROMPT)
            view.invalidate
          rescue StandardError => error
            UI.messagebox("ConstructFlow Opening Edit error: #{error.message}")
            clear_edit
          end

          def onLButtonUp(_flags, _x, _y, view)
            return unless @opening && @preview

            changed = @preview.segment_index != @definition.segment_index ||
                      (@preview.start_offset_mm - @definition.start_offset_mm).abs > 0.001
            unless changed
              clear_edit
              view.invalidate
              return
            end

            input = {
              object_id: @opening.id,
              segment_index: @preview.segment_index,
              start_offset_mm: @preview.start_offset_mm
            }
            input[:level_id] = @active_level_id if @active_level_id
            result = @runtime.commands.execute('ModifyOpening', input, project_id: @runtime.project.project_id)
            if result[:status] == 'success'
              refresh_plan
              Sketchup.set_status_text('Opening updated.', SB_PROMPT)
            else
              UI.messagebox(Array(result[:errors]).join("\n"))
            end
            clear_edit
            view.invalidate
          rescue StandardError => error
            UI.messagebox("ConstructFlow Opening Edit error: #{error.message}")
            clear_edit
          end

          def draw(view)
            definition = @preview && @host ? @preview : @hover_definition
            host_definition = @host ? @host_definition : @hover_host_definition
            return unless definition && host_definition

            points = opening_points(definition, host_definition).map { |point| point_from_mm(point) }
            view.line_width = 3
            view.drawing_color = @opening ? 'blue' : 'cyan'
            view.draw(GL_LINES, points)
            label = @opening ? format('Opening %.0f mm', definition.width_mm) : 'Click Opening to edit'
            view.draw_text(points[0], label)
          rescue StandardError
            nil
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            definition = @preview && @host ? @preview : @hover_definition
            host_definition = @host ? @host_definition : @hover_host_definition
            Array(definition && host_definition && opening_points(definition, host_definition)).each do |point_mm|
              bounds.add(point_from_mm(point_mm))
            end
            bounds
          rescue StandardError
            Geom::BoundingBox.new
          end

          def onCancel(_reason, view)
            if @opening
              clear_edit
              view.invalidate
            else
              @runtime.active_model.select_tool(nil)
            end
          end

          def deactivate(view)
            clear_edit
            view.invalidate if view
          end

          private

          def pick_opening(view, x, y)
            helper = view.pick_helper
            helper.do_pick(x, y)
            helper.count.times do |index|
              path = helper.path_at(index)
              entities = path.respond_to?(:to_a) ? path.to_a.reverse : [path]
              entities.each do |entity|
                object = Core::RepresentationObjectResolver.resolve(@runtime, entity)
                return object if level_compatible_opening?(object)
              rescue StandardError
                next
              end
            end
            nil
          end

          def set_hover_state(view, x, y)
            @hover_opening = pick_opening(view, x, y)
            @hover_definition = @hover_opening && @repository.read(@hover_opening.entity)
            @hover_host = @hover_definition && @runtime.smart_objects.fetch_by_id(@hover_definition.host_object_id)
            unless @hover_host && @host_capability.compatible_host?(@hover_host)
              clear_hover_state
              return
            end

            @hover_host_definition = @host_capability.definition(@hover_host)
            clear_hover_state unless @hover_host_definition
          rescue StandardError
            clear_hover_state
          end

          def clear_hover_state
            @hover_opening = nil
            @hover_definition = nil
            @hover_host = nil
            @hover_host_definition = nil
          end

          def level_compatible_opening?(object)
            return false unless object && object.type == 'opening.rectangular' && object.owner_module == 'constructflow.opening'
            return true unless @active_level_id

            definition = @repository.read(object.entity)
            host = definition && @runtime.smart_objects.fetch_by_id(definition.host_object_id)
            host && @selection_filter.match?(host)
          rescue StandardError
            false
          end

          def host_definition
            @host_definition ||= @host_capability.definition(@host)
          end

          def opening_points(definition, host_definition_value = host_definition)
            path = host_definition_value.centerline_path_mm
            segment = path.each_cons(2).to_a.fetch(definition.segment_index)
            start_point, finish_point = segment
            dx = finish_point[0] - start_point[0]
            dy = finish_point[1] - start_point[1]
            length = Math.sqrt((dx * dx) + (dy * dy))
            ux = dx / length
            uy = dy / length
            a = [start_point[0] + (ux * definition.start_offset_mm), start_point[1] + (uy * definition.start_offset_mm), start_point[2]]
            b = [start_point[0] + (ux * definition.end_offset_mm), start_point[1] + (uy * definition.end_offset_mm), start_point[2]]
            [a, b]
          end

          def point_from_mm(point_mm)
            Geom::Point3d.new(*Core::Units.point_from_mm(point_mm))
          end

          def refresh_plan
            return unless @runtime.respond_to?(:plan_scenes)

            @runtime.plan_scenes.refresh_preset('architecture.construction')
          rescue StandardError => error
            Sketchup.set_status_text("Opening updated; plan refresh pending: #{error.message}", SB_PROMPT)
          end

          def clear_edit
            @opening = nil
            @definition = nil
            @host = nil
            @host_definition = nil
            clear_hover_state
            @preview = nil
          end
        end
      end
    end
  end
end
