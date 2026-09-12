# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      module Tools
        class PlaceTool
          def initialize(runtime:, category:, operation:, frame_material:, panel_style:, handing: 'default', schedule_mark: nil,
                         width_mm: 900, height_mm: 2100, sill_mm: 0, level_id: nil)
            @runtime = runtime
            @input = {
              category: category.to_s,
              operation: operation.to_s,
              frame_material: frame_material.to_s,
              panel_style: panel_style.to_s,
              handing: handing.to_s
            }
            @input[:schedule_mark] = schedule_mark.to_s unless schedule_mark.to_s.empty?
            @width_mm = Float(width_mm)
            @height_mm = Float(height_mm)
            @sill_mm = Float(sill_mm)
            @level_id = level_id.to_s.strip
            @level_id = nil if @level_id.empty?
            @plane = Core::PlanLevelContext.new(runtime, @level_id)
            @level_id = @plane.level_id
            @input[:level_id] = @level_id if @level_id
            @input_point = Sketchup::InputPoint.new
            @opening_host = runtime.capabilities.fetch('opening.infill_host')
            @wall_host = runtime.capabilities.fetch('wall.host_surface')
            @selection_filter = Core::PlanSelectionFilter.new(object_types: ['architecture.wall'], level_id: @level_id)
            @interaction = Core::PlanInteractionEngine.new
            @preview = nil
          end

          def activate
            Sketchup.set_status_text(
              'ConstructFlow Plan Door/Window: hover a Smart Wall for preview, click to place. Existing openings are also supported. Esc to finish.',
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
            if @preview && @input_point.valid?
              label = @preview[:state] == 'valid' ? 'Door/window valid' : @preview[:errors].first
              view.draw_text(@input_point.position, label)
            end
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            host = host_wall_for(@preview_host)
            definition = host && @wall_host.definition(host)
            Array(definition&.centerline_path_mm).each { |point_mm| bounds.add(point_from_mm(point_mm)) }
            bounds
          rescue StandardError
            Geom::BoundingBox.new
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            unless @input_point.valid?
              UI.beep
              Sketchup.set_status_text('Pick a valid ConstructFlow plan point.', SB_PROMPT)
              return
            end

            target = pick_target(view, x, y)
            unless target
              UI.beep
              Sketchup.set_status_text('Hover a ConstructFlow Smart Wall or rectangular opening.', SB_PROMPT)
              return
            end

            result = if @opening_host.compatible_host?(target)
                       @runtime.commands.execute(
                         'CreateDoorWindow',
                         @input.merge(opening_object_id: target.id),
                         project_id: @runtime.project.project_id
                       )
                     else
                       point_mm = placement_point_mm(target)
                       @runtime.commands.execute(
                         'PlaceDoorWindowOnWall',
                         @input.merge(
                           host_object_id: target.id,
                           point_mm: point_mm,
                           width_mm: @width_mm,
                           height_mm: @height_mm,
                           sill_mm: @sill_mm
                         ),
                         project_id: @runtime.project.project_id
                       )
                     end
            if result[:status] == 'success'
              refresh_plan
              Sketchup.set_status_text('Door/window placed. Click another opening or Esc to finish.', SB_PROMPT)
              view.invalidate
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          rescue StandardError => error
            UI.messagebox("ConstructFlow Door/Window placement error: #{error.message}")
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

          def pick_target(view, x, y)
            helper = view.pick_helper
            helper.do_pick(x, y)
            helper.count.times do |index|
              path = helper.path_at(index)
              entities = path.respond_to?(:to_a) ? path.to_a.reverse : [path]
              entities.each do |entity|
                object = Core::RepresentationObjectResolver.resolve(@runtime, entity)
                return object if object && level_compatible_target?(object)
              rescue StandardError
                next
              end
            end
            nil
          end

          def placement_preview(view, x, y)
            target = pick_target(view, x, y)
            @preview_host = target
            return @interaction.placement_feedback(host: nil, candidate: nil) unless target
            return @interaction.placement_feedback(host: target, candidate: { opening_object_id: target.id }) if @opening_host.compatible_host?(target)

            snapped = placement_point_mm(target)
            placement = @wall_host.locate(target, snapped)
            candidate = {
              host_object_id: target.id,
              segment_index: placement[:segment_index],
              start_offset_mm: placement[:distance_along_mm] - (@width_mm / 2.0),
              width_mm: @width_mm,
              height_mm: @height_mm,
              sill_mm: @sill_mm
            }
            @interaction.placement_feedback(host: target, candidate: candidate, errors: @wall_host.validate_opening(target, candidate))
          rescue StandardError => error
            @preview_host = nil
            @interaction.placement_feedback(host: nil, candidate: nil, errors: [error.message])
          end

          def level_compatible_target?(object)
            if @wall_host.compatible_host?(object)
              return @selection_filter.match?(object)
            end
            return false unless @opening_host.compatible_host?(object)
            return true unless @level_id

            opening = Opening::OpeningRepository.new.read(object.entity)
            host = opening && @runtime.smart_objects.fetch_by_id(opening.host_object_id)
            host && @selection_filter.match?(host)
          rescue StandardError
            false
          end

          def draw_host_highlight(view)
            host = host_wall_for(@preview_host)
            return unless host

            definition = @wall_host.definition(host)
            points = definition.centerline_path_mm.map { |point_mm| point_from_mm(point_mm) }
            return if points.length < 2

            view.line_width = 4
            view.drawing_color = @preview && @preview[:state] == 'valid' ? 'green' : 'red'
            view.draw(GL_LINE_STRIP, points)
          rescue StandardError
            nil
          end

          def host_wall_for(target)
            return target if target && @wall_host.compatible_host?(target)
            return unless target && @opening_host.compatible_host?(target)

            opening = Opening::OpeningRepository.new.read(target.entity)
            opening && @runtime.smart_objects.fetch_by_id(opening.host_object_id)
          rescue StandardError
            nil
          end

          def placement_point_mm(target)
            point_mm = @plane.project(Core::Units.point_to_mm(@input_point.position))
            definition = @wall_host.definition(target)
            @interaction.snap(point_mm, references: [{ path_mm: definition.centerline_path_mm }])[:point_mm]
          end

          def point_from_mm(point_mm)
            values = Core::Units.point_from_mm(point_mm)
            Geom::Point3d.new(*values)
          end

          def refresh_plan
            return unless @runtime.respond_to?(:plan_scenes)

            @runtime.plan_scenes.refresh_preset('architecture.construction')
          rescue StandardError => error
            Sketchup.set_status_text("Door/window placed; plan refresh pending: #{error.message}", SB_PROMPT)
          end
        end
      end
    end
  end
end
