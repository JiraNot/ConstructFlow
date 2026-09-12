# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Tools
        class WallEditTool
          PICK_THRESHOLD_PX = 16.0

          def initialize(runtime:, constraint_mode: :orthogonal, copy: false, level_id: nil, snap_tolerance_mm: Core::PlanInteractionEngine::DEFAULT_SNAP_TOLERANCE_MM)
            @runtime = runtime
            @constraint_mode = constraint_mode.to_sym
            @copy_mode = !!copy
            @active_level_id = level_id.to_s.strip
            @active_level_id = nil if @active_level_id.empty?
            @plane = Core::PlanLevelContext.new(runtime, @active_level_id)
            @selection_filter = Core::PlanSelectionFilter.new(object_types: ['architecture.wall'], level_id: @active_level_id)
            @interaction = Core::PlanInteractionEngine.new(snap_tolerance_mm: snap_tolerance_mm)
            @references = PlanReferenceCollector.new(runtime)
            @input_point = Sketchup::InputPoint.new
            @wall = nil
            @definition = nil
            @hover_wall = nil
            @hover_definition = nil
            @action = nil
            @endpoint_index = nil
            @segment_index = nil
            @origin_mm = nil
            @preview_definition = nil
            @numeric_length_mm = nil
          end

          def activate
            Sketchup.set_status_text(
              @copy_mode ? 'ConstructFlow Plan Wall Copy: click wall and drag. Shift toggles free mode; Esc cancels.' : 'ConstructFlow Plan Wall Edit: click wall and drag; T changes type; F flips orientation; Shift toggles free mode; Esc cancels.',
              SB_PROMPT
            )
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            unless @wall
              @hover_wall = @input_point.valid? ? pick_wall(view, x, y) : nil
              @hover_definition = @hover_wall && WallRepository.new.read(@hover_wall.entity)
              return view.invalidate
            end

            unless @origin_mm && @input_point.valid?
              @preview_definition = nil
              return view.invalidate
            end

            cursor_mm = @plane.project(Core::Units.point_to_mm(@input_point.position))
            snapped_cursor = @interaction.snap(cursor_mm, references: plan_references)
            cursor_mm = snapped_cursor[:point_mm]
            @preview_definition = if @action == :stretch
                                    point = stretch_cursor_point(cursor_mm)
                                    @definition.stretched_endpoint(index: @endpoint_index, point_mm: point)
                                  elsif @action == :segment
                                    delta = [cursor_mm[0] - @origin_mm[0], cursor_mm[1] - @origin_mm[1], 0.0]
                                    delta = orthogonal_delta(delta) if @constraint_mode == :orthogonal
                                    @definition.translated_segment(index: @segment_index, delta_mm: delta)
                                  else
                                    delta = [
                                      cursor_mm[0] - @origin_mm[0],
                                      cursor_mm[1] - @origin_mm[1],
                                      0.0
                                    ]
                                    if @constraint_mode == :orthogonal
                                      delta = orthogonal_delta(delta)
                                    end
                                    @definition.translated(delta)
                                  end
            view.invalidate
          rescue StandardError
            @preview_definition = nil
            view.invalidate
          end

          def onLButtonDown(_flags, x, y, view)
            return if @wall

            @input_point.pick(view, x, y)
            wall = pick_wall(view, x, y)
            unless wall && @input_point.valid?
              Sketchup.set_status_text('Pick a ConstructFlow Smart Wall or endpoint.', SB_PROMPT)
              return
            end

            @wall = wall
            @definition = WallRepository.new.read(wall.entity)
            raise ArgumentError, 'selected wall definition missing' unless @definition
            @hover_wall = nil
            @hover_definition = nil
            @level_id = @active_level_id || editing_level_id(wall, @definition)
            @plane = Core::PlanLevelContext.new(@runtime, @level_id)

            @origin_mm = @interaction.snap(
              @plane.project(Core::Units.point_to_mm(@input_point.position)), references: plan_references
            )[:point_mm]
            @endpoint_index = nearest_endpoint_index(view, x, y, @definition)
            @segment_index = nearest_segment_index(view, x, y, @definition) if @endpoint_index.nil?
            @action = @copy_mode ? :copy : (@endpoint_index ? :stretch : (@segment_index ? :segment : :move))
            Sketchup.set_status_text(
              if @action == :stretch
                'Drag endpoint to stretch wall.'
              elsif @action == :segment
                'Drag wall segment to reshape wall.'
              else
                'Drag wall to move it.'
              end,
              SB_PROMPT
            )
            view.invalidate
          rescue StandardError => error
            UI.messagebox("ConstructFlow Wall Edit error: #{error.message}")
            clear_edit
          end

          def onLButtonUp(_flags, _x, _y, view)
            return unless @wall && @preview_definition

            if @preview_definition.path_mm == @definition.path_mm
              clear_edit
              view.invalidate
              return
            end

            input = if @action == :stretch
                      { object_id: @wall.id, endpoint_index: @endpoint_index,
                        point_mm: @preview_definition.path_mm[@endpoint_index] }
                    elsif @action == :segment
                      original = @definition.path_mm[@segment_index]
                      moved = @preview_definition.path_mm[@segment_index]
                      { object_id: @wall.id, segment_index: @segment_index,
                        delta_mm: [moved[0] - original[0], moved[1] - original[1], 0.0] }
                    else
                      original = @definition.path_mm.first
                      moved = @preview_definition.path_mm.first
                      { object_id: @wall.id, delta_mm: [moved[0] - original[0], moved[1] - original[1], 0.0] }
                    end
            command = if @action == :stretch
                        'StretchWallEndpoint'
                      elsif @action == :segment
                        'MoveWallSegment'
                      elsif @action == :copy
                        'CopyWall'
                      else
                        'MoveWall'
                      end
            result = @runtime.commands.execute(command, input, project_id: @runtime.project.project_id)
            if result[:status] == 'success'
              refresh_plan
            else
              UI.messagebox(result[:errors].join("\n"))
            end
            clear_edit
            view.invalidate
          rescue StandardError => error
            UI.messagebox("ConstructFlow Wall Edit error: #{error.message}")
            clear_edit
          end

          def draw(view)
            definition = @preview_definition || @definition || @hover_definition
            return unless definition

            points = definition.centerline_path_mm.map { |point_mm| point_from_mm(point_mm) }
            view.line_width = @wall ? 3 : 2
            view.drawing_color = @wall ? 'blue' : 'cyan'
            view.draw(GL_LINE_STRIP, points)
            view.draw_points(points, @wall ? 7 : 5, 1, @wall ? 'blue' : 'cyan')
            unless @wall
              label = @copy_mode ? 'Click Smart Wall to copy' : 'Click Smart Wall to edit'
              view.draw_text(points[points.length / 2], label) if points.any?
              return
            end
            if @action == :segment && @segment_index
              first = points[@segment_index]
              second = points[@segment_index + 1]
              midpoint = Geom::Point3d.new(
                (first.x + second.x) / 2.0,
                (first.y + second.y) / 2.0,
                (first.z + second.z) / 2.0
              )
              view.draw_points([midpoint], 9, 1, 'orange')
            end
            if @action == :stretch && @endpoint_index
              view.draw_points([points[@endpoint_index]], 10, 1, 'orange')
            end
            dimension = preview_dimension(definition)
            if dimension
              label_point = if @action == :stretch && @endpoint_index
                              points[@endpoint_index]
                            elsif @action == :segment && @segment_index
                              first = points[@segment_index]
                              second = points[@segment_index + 1]
                              Geom::Point3d.new(
                                (first.x + second.x) / 2.0,
                                (first.y + second.y) / 2.0,
                                (first.z + second.z) / 2.0
                              )
                            else
                              points[points.length / 2]
                            end
              view.draw_text(label_point, dimension)
            end
          rescue StandardError
            nil
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            definition = @preview_definition || @definition || @hover_definition
            Array(definition&.centerline_path_mm).each { |point_mm| bounds.add(point_from_mm(point_mm)) }
            bounds
          end

          def enableVCB?
            true
          end

          def onUserText(text, view)
            @numeric_length_mm = typed_stretch_length(text)
            label = text.to_s.strip.start_with?('+', '-') ? 'relative' : 'absolute'
            Sketchup.set_status_text("ConstructFlow Plan Wall Edit: #{@numeric_length_mm.round(1)} mm (#{label})", SB_PROMPT)
            view.invalidate
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end

          def onKeyDown(key, repeat, _flags, view)
            if key == 84 && !repeat && @wall # T
              change_wall_type(view)
              return
            end
            if key == 70 && !repeat && @wall # F
              result = @runtime.commands.execute(
                'FlipWallOrientation', { object_id: @wall.id }, project_id: @runtime.project.project_id
              )
              if result[:status] == 'success'
                @definition = WallRepository.new.read(@wall.entity)
                @preview_definition = @definition
                refresh_plan
                Sketchup.set_status_text("Wall orientation flipped to #{@definition.orientation}.", SB_PROMPT)
              else
                UI.messagebox(Array(result[:errors]).join("\n"))
              end
              view.invalidate
              return
            end
            return unless key == 16 && !repeat

            @constraint_mode = @constraint_mode == :free ? :orthogonal : :free
            Sketchup.set_status_text("ConstructFlow Plan Wall Edit: #{@constraint_mode} mode.", SB_PROMPT)
            view.invalidate
          end

          def onCancel(_reason, view)
            if @wall
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

          def change_wall_type(view)
            values = UI.inputbox(
              ['Thickness (mm)', 'Wall type ID'],
              [@definition.thickness_mm.to_s, @definition.wall_type_id.to_s],
              'ConstructFlow Change Smart Wall Type'
            )
            return unless values

            result = @runtime.commands.execute(
              'ChangeWallType',
              { object_id: @wall.id, thickness_mm: Float(values[0]), wall_type_id: values[1].to_s.strip },
              project_id: @runtime.project.project_id
            )
            if result[:status] == 'success'
              @definition = WallRepository.new.read(@wall.entity)
              @preview_definition = @definition
              refresh_plan
              Sketchup.set_status_text("Wall type changed to #{@definition.wall_type_id}.", SB_PROMPT)
            else
              UI.messagebox(Array(result[:errors]).join("\n"))
            end
            view.invalidate
          rescue ArgumentError => error
            UI.messagebox("Invalid wall type input: #{error.message}")
          rescue StandardError => error
            UI.messagebox("ConstructFlow Wall type error: #{error.message}")
          end

          def pick_wall(view, x, y)
            helper = view.pick_helper
            helper.do_pick(x, y)
            helper.count.times do |index|
              path = helper.path_at(index)
              entities = path.respond_to?(:to_a) ? path.to_a.reverse : [path]
              entities.each do |entity|
                object = smart_object_for(entity)
                return object if @selection_filter.match?(object)
              rescue StandardError
                next
              end
            end
            nil
          end

          def smart_object_for(entity)
            Core::RepresentationObjectResolver.resolve(@runtime, entity)
          end

          def nearest_endpoint_index(view, x, y, definition)
            candidates = definition.centerline_path_mm.each_with_index.map do |point_mm, index|
              screen = view.screen_coords(point_from_mm(point_mm))
              [index, Math.sqrt(((screen.x - x)**2) + ((screen.y - y)**2))]
            end
            nearest = candidates.min_by(&:last)
            nearest && nearest.last <= PICK_THRESHOLD_PX ? nearest.first : nil
          end

          def nearest_segment_index(view, x, y, definition)
            candidates = definition.centerline_path_mm.each_cons(2).with_index.map do |(first, second), index|
              a = view.screen_coords(point_from_mm(first))
              b = view.screen_coords(point_from_mm(second))
              [index, distance_to_segment(x, y, a.x, a.y, b.x, b.y)]
            end
            nearest = candidates.min_by(&:last)
            nearest && nearest.last <= PICK_THRESHOLD_PX ? nearest.first : nil
          end

          def distance_to_segment(px, py, ax, ay, bx, by)
            dx = bx - ax
            dy = by - ay
            length_squared = (dx * dx) + (dy * dy)
            return Math.sqrt(((px - ax)**2) + ((py - ay)**2)) if length_squared.zero?

            ratio = [[((px - ax) * dx + (py - ay) * dy) / length_squared, 0.0].max, 1.0].min
            cx = ax + ratio * dx
            cy = ay + ratio * dy
            Math.sqrt(((px - cx)**2) + ((py - cy)**2))
          end

          def orthogonal_delta(delta)
            if delta[0].abs >= delta[1].abs
              [delta[0], 0.0, 0.0]
            else
              [0.0, delta[1], 0.0]
            end
          end

          def preview_dimension(definition)
            if @numeric_length_mm && @action == :stretch
              format('L %.0f mm (typed)', @numeric_length_mm)
            elsif @action == :segment && @segment_index
              format('Segment %.0f mm', segment_length(definition.path_mm[@segment_index], definition.path_mm[@segment_index + 1]))
            elsif @action == :stretch && @endpoint_index
              anchor_index = @endpoint_index.zero? ? 1 : @endpoint_index - 1
              format('L %.0f mm', segment_length(definition.path_mm[anchor_index], definition.path_mm[@endpoint_index]))
            else
              format('Wall %.0f mm', definition.length_mm)
            end
          end

          def segment_length(first, second)
            Math.sqrt(
              ((second[0] - first[0])**2) +
                ((second[1] - first[1])**2) +
                ((second[2] - first[2])**2)
            )
          end

          def plan_references
            @references.paths(level_id: @level_id)
          end

          def editing_level_id(object, definition)
            return definition.base_level_id unless definition.base_level_id.to_s.empty?
            return unless object.respond_to?(:level_refs)

            reference = Array(object.level_refs).first
            if reference.is_a?(Hash)
              reference[:level_id] || reference['level_id']
            else
              reference
            end
          end

          def point_from_mm(point_mm)
            values = Core::Units.point_from_mm(point_mm)
            Geom::Point3d.new(*values)
          end

          def clear_edit
            @wall = nil
            @definition = nil
            @hover_wall = nil
            @hover_definition = nil
            @level_id = @active_level_id
            @plane = Core::PlanLevelContext.new(@runtime, @active_level_id)
            @action = nil
            @endpoint_index = nil
            @segment_index = nil
            @origin_mm = nil
            @preview_definition = nil
            @numeric_length_mm = nil
          end

          def stretch_cursor_point(cursor_mm)
            return @definition.location_path_point_from_centerline(cursor_mm, @endpoint_index) unless @numeric_length_mm

            path = @definition.centerline_path_mm
            anchor_index = @endpoint_index.zero? ? 1 : @endpoint_index - 1
            anchor = path.fetch(anchor_index)
            preview = @interaction.segment_preview(
              anchor, cursor_mm, mode: @constraint_mode, length_mm: @numeric_length_mm
            )
            @definition.location_path_point_from_centerline(preview[:finish_mm], @endpoint_index)
          end

          def typed_stretch_length(text)
            value = text.to_s.strip
            return @interaction.numeric_distance_mm(value) unless @action == :stretch && @endpoint_index && value.start_with?('+', '-')

            sign = value.start_with?('-') ? -1.0 : 1.0
            delta = @interaction.numeric_distance_mm(value[1..])
            path = @definition.centerline_path_mm
            anchor_index = @endpoint_index.zero? ? 1 : @endpoint_index - 1
            current = segment_length(path[anchor_index], path[@endpoint_index])
            length = current + (sign * delta)
            raise ArgumentError, 'relative wall length must remain greater than zero' unless length.positive?

            length
          end

          def refresh_plan
            return unless @runtime.respond_to?(:plan_scenes)

            @runtime.plan_scenes.refresh_preset('architecture.construction')
          rescue StandardError => error
            Sketchup.set_status_text("Wall updated; plan refresh pending: #{error.message}", SB_PROMPT)
          end
        end
      end
    end
  end
end
