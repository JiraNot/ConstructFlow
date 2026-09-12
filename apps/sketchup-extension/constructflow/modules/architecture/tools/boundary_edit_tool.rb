# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module Tools
        class BoundaryEditTool
          PICK_THRESHOLD_PX = 18.0

          def initialize(runtime:, object_type:, repository:, command:, label:, read_method: :read,
                         points_method: :boundary_mm, input_key: :boundary_mm, level_id: nil)
            @runtime = runtime
            @object_type = object_type.to_s
            @repository = repository
            @command = command.to_s
            @label = label.to_s
            @read_method = read_method.to_sym
            @points_method = points_method.to_sym
            @input_key = input_key.to_sym
            @active_level_id = level_id.to_s.strip
            @active_level_id = nil if @active_level_id.empty?
            @plane = Core::PlanLevelContext.new(runtime, @active_level_id)
            @selection_filter = Core::PlanSelectionFilter.new(object_types: [@object_type], level_id: @active_level_id)
            @input_point = Sketchup::InputPoint.new
            @interaction = Core::PlanInteractionEngine.new
            @references = PlanReferenceCollector.new(runtime)
            @object = nil
            @definition = nil
            @hover_object = nil
            @hover_definition = nil
            @index = nil
            @preview = nil
          end

          def activate
            Sketchup.set_status_text("ConstructFlow #{@label}: click object, then drag a boundary vertex. Esc cancels.", SB_PROMPT)
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            unless @object
              @hover_object = @input_point.valid? ? pick_object(view, x, y) : nil
              @hover_definition = @hover_object && @repository.public_send(@read_method, @hover_object.entity)
              return view.invalidate
            end

            if @index && @input_point.valid?
              point = @interaction.snap(
                @plane.project(Core::Units.point_to_mm(@input_point.position)), references: @references.paths(level_id: @level_id)
              )[:point_mm].dup
              points = boundary_points
              point[2] = points[@index][2]
              @preview = points.map.with_index { |item, item_index| item_index == @index ? point.freeze : item }
            end
            view.invalidate
          end

          def onLButtonDown(_flags, x, y, view)
            return if @object

            @input_point.pick(view, x, y)
            object = pick_object(view, x, y)
            unless object
              Sketchup.set_status_text("Pick a ConstructFlow #{@label}.", SB_PROMPT)
              return
            end

            @object = object
            @definition = @repository.public_send(@read_method, object.entity)
            raise ArgumentError, 'boundary definition missing' unless @definition
            @hover_object = nil
            @hover_definition = nil
            @level_id = @active_level_id || (@definition.respond_to?(:level_id) ? @definition.level_id : nil)
            @plane = Core::PlanLevelContext.new(@runtime, @level_id)
            @index = nearest_endpoint_index(view, x, y, boundary_points)
            unless @index
              clear_edit
              Sketchup.set_status_text("Pick a #{@label} boundary vertex.", SB_PROMPT)
              return
            end

            @preview = boundary_points
            Sketchup.set_status_text("Drag #{@label} vertex #{@index + 1}; release to commit.", SB_PROMPT)
            view.invalidate
          rescue StandardError => error
            UI.messagebox("ConstructFlow #{@label} edit error: #{error.message}")
            clear_edit
          end

          def onLButtonUp(_flags, _x, _y, view)
            return unless @object && @preview

            result = @runtime.commands.execute(
              @command,
              { object_id: @object.id, @input_key => @preview },
              project_id: @runtime.project.project_id
            )
            if result[:status] == 'success'
              refresh_plan
              Sketchup.set_status_text("#{@label} boundary updated.", SB_PROMPT)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
            clear_edit
            view.invalidate
          rescue StandardError => error
            UI.messagebox("ConstructFlow #{@label} edit error: #{error.message}")
            clear_edit
          end

          def draw(view)
            definition = @preview ? nil : @hover_definition
            points_mm = @preview || (definition && boundary_points_for(definition))
            return unless points_mm

            points = points_mm.map { |point| point_from_mm(point) }
            points << points.first if points.length > 2
            view.line_width = @object ? 3 : 2
            view.drawing_color = @object ? 'blue' : 'cyan'
            view.draw(GL_LINE_STRIP, points)
            if @object
              view.draw_points([points[@index]], 10, 1, 'orange') if @index
            elsif points.any?
              view.draw_text(points[points.length / 2], "Click #{@label} to edit")
            end
          rescue StandardError
            nil
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            points_mm = @preview || (@hover_definition && boundary_points_for(@hover_definition))
            Array(points_mm).each { |point_mm| bounds.add(point_from_mm(point_mm)) }
            bounds
          end

          def onCancel(_reason, view)
            if @object
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

          def boundary_points
            Array(@definition.public_send(@points_method))
          end

          def pick_object(view, x, y)
            helper = view.pick_helper
            helper.do_pick(x, y)
            helper.count.times do |index|
              path = helper.path_at(index)
              entities = path.respond_to?(:to_a) ? path.to_a.reverse : [path]
              entities.each do |entity|
                object = Core::RepresentationObjectResolver.resolve(@runtime, entity)
                return object if @selection_filter.match?(object)
              end
            end
            nil
          end

          def nearest_endpoint_index(view, x, y, points)
            candidates = Array(points).each_with_index.map do |point, index|
              screen = view.screen_coords(point_from_mm(point))
              [index, Math.sqrt(((screen.x - x)**2) + ((screen.y - y)**2))]
            end
            nearest = candidates.min_by(&:last)
            nearest && nearest.last <= PICK_THRESHOLD_PX ? nearest.first : nil
          end

          def point_from_mm(values)
            x, y, z = Core::Units.point_from_mm(values)
            Geom::Point3d.new(x, y, z)
          end

          def clear_edit
            @object = nil
            @definition = nil
            @hover_object = nil
            @hover_definition = nil
            @level_id = @active_level_id
            @plane = Core::PlanLevelContext.new(@runtime, @active_level_id)
            @index = nil
            @preview = nil
          end

          def boundary_points_for(definition)
            Array(definition.public_send(@points_method))
          end

          def refresh_plan
            return unless @runtime.respond_to?(:plan_scenes)

            @runtime.plan_scenes.refresh_preset('architecture.construction')
          rescue StandardError => error
            Sketchup.set_status_text("#{@label} updated; plan refresh pending: #{error.message}", SB_PROMPT)
          end
        end
      end
    end
  end
end
