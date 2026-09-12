# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Opening
      module Tools
        class OpeningTool
          def initialize(runtime:, width_mm:, height_mm:, sill_mm:, level_id: nil)
            @runtime = runtime
            @width_mm = Float(width_mm)
            @height_mm = Float(height_mm)
            @sill_mm = Float(sill_mm)
            @level_id = level_id.to_s.strip
            @level_id = nil if @level_id.empty?
            @plane = Core::PlanLevelContext.new(runtime, @level_id)
            @level_id = @plane.level_id
            @input_point = Sketchup::InputPoint.new
            @host_capability = runtime.capabilities.fetch('wall.host_surface')
            @interaction = Core::PlanInteractionEngine.new
            @selection_filter = Core::PlanSelectionFilter.new(object_types: ['architecture.wall'], level_id: @level_id)
          end

          def activate
            Sketchup.set_status_text(
              'ConstructFlow Opening: click a Smart Wall to place opening. Esc to cancel.',
              SB_PROMPT
            )
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            @preview_host = nil unless @input_point.valid?
            @preview = @input_point.valid? ? placement_preview(view, x, y) : nil
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?
            draw_host_highlight(view)
            if @preview
              label = @preview[:state] == 'valid' ? 'Opening valid' : @preview[:state] == 'invalid' ? @preview[:errors].first : 'Select Smart Wall'
              view.draw_text(@input_point.position, label) if @input_point.valid?
            end
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            definition = @preview_host && @host_capability.definition(@preview_host)
            Array(definition&.centerline_path_mm).each { |point_mm| bounds.add(point_from_mm(point_mm)) }
            bounds
          rescue StandardError
            Geom::BoundingBox.new
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            host = pick_host(view, x, y)
            unless host
              UI.beep
              Sketchup.set_status_text('Select a ConstructFlow Smart Wall.', SB_PROMPT)
              return
            end

            point_mm = snapped_host_point(host)
            placement = @host_capability.locate(host, point_mm)
            start_offset = placement[:distance_along_mm] - (@width_mm / 2.0)

            input = {
              host_object_id: host.id,
              segment_index: placement[:segment_index],
              start_offset_mm: start_offset,
              width_mm: @width_mm,
              height_mm: @height_mm,
              sill_mm: @sill_mm
            }
            input[:level_id] = @level_id if @level_id
            result = @runtime.commands.execute('CreateOpening', input, project_id: @runtime.project.project_id)

            if result[:status] == 'success'
              refresh_plan
              Sketchup.set_status_text('Opening created. Click another Smart Wall or Esc to finish.', SB_PROMPT)
              view.invalidate
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          rescue StandardError => error
            UI.messagebox("ConstructFlow Opening error: #{error.message}")
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end

          def deactivate(view)
            @preview = nil
            @preview_host = nil
            view.invalidate if view
          end

          private

          def pick_host(view, x, y)
            helper = view.pick_helper
            helper.do_pick(x, y)
            helper.count.times do |index|
              path = helper.path_at(index)
              candidates = if path.respond_to?(:to_a)
                             path.to_a.reverse
                           else
                             [path]
                           end
              candidates.each do |entity|
                object = smart_object_for(entity)
                return object if @host_capability.compatible_host?(object) && @selection_filter.match?(object)
              rescue StandardError
                next
              end
            end
            nil
          end

          def smart_object_for(entity)
            Core::RepresentationObjectResolver.resolve(@runtime, entity)
          end

          def placement_preview(view, x, y)
            host = pick_host(view, x, y)
            @preview_host = host
            return Core::PlanInteractionEngine.new.placement_feedback(host: nil, candidate: nil) unless host

            point_mm = snapped_host_point(host)
            placement = @host_capability.locate(host, point_mm)
            descriptor = {
              segment_index: placement[:segment_index],
              start_offset_mm: placement[:distance_along_mm] - (@width_mm / 2.0),
              width_mm: @width_mm,
              height_mm: @height_mm,
              sill_mm: @sill_mm
            }
            errors = @host_capability.validate_opening(host, descriptor)
            @interaction.placement_feedback(host: host, candidate: descriptor, errors: errors)
          rescue StandardError => error
            @preview_host = nil
            @interaction.placement_feedback(host: nil, candidate: nil, errors: [error.message])
          end

          def draw_host_highlight(view)
            return unless @preview_host

            definition = @host_capability.definition(@preview_host)
            points = definition.centerline_path_mm.map { |point_mm| point_from_mm(point_mm) }
            return if points.length < 2

            view.line_width = 4
            view.drawing_color = @preview && @preview[:state] == 'valid' ? 'green' : 'red'
            view.draw(GL_LINE_STRIP, points)
          rescue StandardError
            nil
          end

          def snapped_host_point(host)
            point_mm = @plane.project(Core::Units.point_to_mm(@input_point.position))
            definition = @host_capability.definition(host)
            @interaction.snap(point_mm, references: [{ path_mm: definition.centerline_path_mm }])[:point_mm]
          rescue StandardError
            point_mm
          end

          def point_from_mm(point_mm)
            values = Core::Units.point_from_mm(point_mm)
            Geom::Point3d.new(*values)
          end

          def refresh_plan
            return unless @runtime.respond_to?(:plan_scenes)

            @runtime.plan_scenes.refresh_preset('architecture.construction')
          rescue StandardError => error
            Sketchup.set_status_text("Opening created; plan refresh pending: #{error.message}", SB_PROMPT)
          end
        end
      end
    end
  end
end
