# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      module RoutingRegistration
        module_function

        def install(runtime)
          planner = RoutePlanner.new
          repository = Repository.new
          geometry = Geometry.new
          validator = Validators::DrainageValidator.new

          register_plan(runtime, planner)
          register_create(runtime, planner, repository, geometry, validator)
          planner
        end

        def register_plan(runtime, planner)
          return if runtime.commands.registered?('PlanDrainageRoute')

          runtime.commands.register('PlanDrainageRoute', owner_module: 'constructflow.drainage', transaction: false) do |command|
            input = command[:input]
            plan = build_plan(runtime, planner, input)
            {
              warnings: plan.warnings,
              events: [{
                name: 'DrainageRoutePlanned',
                payload: plan.to_h
              }]
            }
          end
        end

        def register_create(runtime, planner, repository, geometry, validator)
          return if runtime.commands.registered?('CreateRoutedPipe')

          runtime.commands.register(
            'CreateRoutedPipe',
            owner_module: 'constructflow.drainage',
            validator: lambda { |command|
              begin
                plan = build_plan(runtime, planner, command[:input])
                input = route_input(command[:input], plan)
                Registration.pipe_route_validation_errors(input, runtime, validator)
              rescue StandardError => error
                [error.message]
              end
            }
          ) do |command|
            plan = build_plan(runtime, planner, command[:input])
            input = route_input(command[:input], plan)
            smart_object, definition, connection = Registration.create_pipe_route_object(
              runtime, repository, geometry, input
            )
            validation = validator.validate_route(definition)
            runtime.smart_objects.mark_dirty(smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: [smart_object.id],
              warnings: (plan.warnings + Registration.warning_messages(validation)).uniq,
              events: [
                { name: 'ObjectCreated', object_ids: [smart_object.id], payload: { type: 'drainage.pipe_route' } },
                {
                  name: 'DrainageRoutePlanned',
                  object_ids: [smart_object.id],
                  payload: plan.to_h.merge('connection_id' => connection['id'])
                },
                { name: 'DrainageTopologyChanged', object_ids: [smart_object.id], payload: { connection_id: connection['id'] } },
                { name: 'RouteChanged', object_ids: [smart_object.id], payload: { route_strategy: definition.route_strategy } },
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] },
                { name: 'ValidationStateChanged', object_ids: [smart_object.id], payload: { issues: validation } }
              ]
            }
          end
        end

        def build_plan(runtime, planner, input)
          start_id = value(input, :start_connector_id).to_s
          end_id = value(input, :end_connector_id).to_s
          raise ArgumentError, 'start_connector_id required' if start_id.empty?
          raise ArgumentError, 'end_connector_id required' if end_id.empty?

          start_connector = runtime.connectors.connector(start_id)
          end_connector = runtime.connectors.connector(end_id)
          planner.plan(
            start_connector: start_connector,
            end_connector: end_connector,
            mode: value(input, :routing_mode) || value(input, :route_strategy) || 'semi_auto',
            via_nodes_mm: value(input, :via_nodes_mm) || value(input, :route_nodes_mm) || [],
            start_invert_mm: value(input, :start_invert_mm),
            end_invert_mm: value(input, :end_invert_mm),
            minimum_slope_percent: value(input, :minimum_slope_percent) || Validators::DrainageValidator::MIN_SLOPE_PERCENT,
            orthogonal_preference: value(input, :orthogonal_preference) || 'x_first'
          )
        end

        def route_input(input, plan)
          {
            system: value(input, :system) || 'waste',
            diameter_mm: value(input, :diameter_mm) || PipeRouteDefinition::DEFAULT_DIAMETER_MM,
            route_nodes_mm: plan.route_nodes_mm,
            start_connector_id: value(input, :start_connector_id),
            end_connector_id: value(input, :end_connector_id),
            start_invert_mm: plan.start_invert_mm,
            end_invert_mm: plan.end_invert_mm,
            material: value(input, :material) || 'pvc',
            route_strategy: plan.mode,
            display_name: value(input, :display_name),
            created_phase: value(input, :created_phase),
            source_state: value(input, :source_state)
          }
        end

        def value(input, key)
          input[key] || input[key.to_s]
        end
      end
    end
  end
end
