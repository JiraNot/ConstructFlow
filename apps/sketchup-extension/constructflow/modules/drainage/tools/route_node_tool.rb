# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      module Tools
        class RouteNodeTool
          PICK_THRESHOLD_PX = 14.0

          def initialize(runtime:, route_object_id:, regrade: true, repository: Repository.new, picker: RouteNodePicker.new)
            @runtime = runtime
            @route_object_id = route_object_id.to_s
            @regrade = regrade == true
            @repository = repository
            @picker = picker
            @input_point = Sketchup::InputPoint.new
            @interaction = Core::PlanInteractionEngine.new
            @active_node_index = nil
            @preview_position_mm = nil
          end

          def activate
            route_definition!
            Sketchup.set_status_text('ConstructFlow Drainage: drag an internal route grip. Endpoints are connector-owned. Esc to finish.', SB_PROMPT)
          rescue StandardError => error
            UI.messagebox(error.message)
            @runtime.active_model.select_tool(nil)
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            if @active_node_index && @input_point.valid?
              @preview_position_mm = snapped_point
            elsif !@input_point.valid?
              @preview_position_mm = nil
            end
            view.invalidate
          end

          def onLButtonDown(_flags, x, y, view)
            return if @active_node_index
            definition = route_definition!
            picked = @picker.nearest_internal_node(
              route_nodes_mm: definition.route_nodes_mm,
              cursor_xy: [x, y],
              projector: ->(point_mm) { screen_xy(view, point_mm) },
              threshold_px: PICK_THRESHOLD_PX
            )
            unless picked
              Sketchup.set_status_text('No internal route grip under cursor. Pick a visible intermediate node.', SB_PROMPT)
              return
            end
            @active_node_index = picked['node_index']
            @input_point.pick(view, x, y)
            @preview_position_mm = snapped_point if @input_point.valid?
            view.invalidate
          end

          def onLButtonUp(_flags, x, y, view)
            return unless @active_node_index
            @input_point.pick(view, x, y)
            if @input_point.valid?
              position = snapped_point
              result = @runtime.commands.execute(
                'MoveDrainageRouteNode',
                { object_id: @route_object_id, node_index: @active_node_index, position_mm: position, regrade: @regrade },
                project_id: @runtime.project.project_id
              )
              UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
            end
            @active_node_index = nil
            @preview_position_mm = nil
            view.invalidate
          rescue StandardError => error
            UI.messagebox("ConstructFlow Drainage route edit error: #{error.message}")
            @active_node_index = nil
            @preview_position_mm = nil
          end

          def draw(view)
            definition = route_definition!
            points = definition.route_nodes_mm.each_with_index.filter_map do |point_mm, index|
              next if index.zero? || index == definition.route_nodes_mm.length - 1
              point(index == @active_node_index && @preview_position_mm ? @preview_position_mm : point_mm)
            end
            view.draw_points(points, 9, 1, 'orange') unless points.empty?
            @input_point.draw(view) if @active_node_index && @input_point.valid?
          rescue StandardError
            nil
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            definition = route_definition!
            Array(definition&.route_nodes_mm).each { |point_mm| bounds.add(point(point_mm)) }
            bounds
          rescue StandardError
            Geom::BoundingBox.new
          end

          def onCancel(_reason, view)
            if @active_node_index
              @active_node_index = nil
              @preview_position_mm = nil
              view.invalidate
            else
              @runtime.active_model.select_tool(nil)
            end
          end

          def deactivate(view)
            @active_node_index = nil
            @preview_position_mm = nil
            view.invalidate if view
          end

          private

          def route_definition!
            object = @runtime.smart_objects.fetch_by_id(@route_object_id)
            raise ArgumentError, 'selected object is not a ConstructFlow drainage route' unless object && object.type == 'drainage.pipe_route'
            definition = @repository.read_pipe_route(object.entity)
            raise ArgumentError, 'drainage route definition missing' unless definition
            definition
          end

          def screen_xy(view, point_mm)
            screen = view.screen_coords(point(point_mm))
            [screen.x, screen.y]
          end

          def snapped_point
            @interaction.snap(
              Core::Units.point_to_mm(@input_point.position),
              references: plan_references
            )[:point_mm]
          end

          def plan_references
            return [] unless defined?(Architecture::PlanReferenceCollector)

            Architecture::PlanReferenceCollector.new(@runtime).paths
          rescue StandardError
            []
          end

          def point(values_mm)
            x, y, z = Core::Units.point_from_mm(values_mm)
            Geom::Point3d.new(x, y, z)
          end
        end
      end
    end
  end
end
