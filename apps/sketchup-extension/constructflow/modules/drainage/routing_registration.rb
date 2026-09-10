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
          edit_service = RouteEditService.new

          register_plan(runtime, planner)
          register_alternatives(runtime, planner)
          register_create(runtime, planner, repository, geometry, validator)
          register_route_edits(runtime, edit_service, repository, geometry, validator)
          planner
        end

        def register_plan(runtime, planner)
          return if runtime.commands.registered?('PlanDrainageRoute')

          runtime.commands.register('PlanDrainageRoute', owner_module: 'constructflow.drainage', transaction: false) do |command|
            input = command[:input]
            plan = build_plan(runtime, planner, input)
            { warnings: plan.warnings, events: [{ name: 'DrainageRoutePlanned', payload: plan.to_h }] }
          end
        end

        def register_alternatives(runtime, planner)
          return if runtime.commands.registered?('PlanDrainageRouteAlternatives')

          runtime.commands.register('PlanDrainageRouteAlternatives', owner_module: 'constructflow.drainage', transaction: false) do |command|
            input = command[:input]
            start_id = value(input, :start_connector_id).to_s
            end_id = value(input, :end_connector_id).to_s
            raise ArgumentError, 'start_connector_id required' if start_id.empty?
            raise ArgumentError, 'end_connector_id required' if end_id.empty?

            alternatives = RouteAlternativePlanner.new(runtime: runtime, planner: planner).alternatives(
              start_connector: runtime.connectors.connector(start_id),
              end_connector: runtime.connectors.connector(end_id),
              start_invert_mm: value(input, :start_invert_mm),
              end_invert_mm: value(input, :end_invert_mm),
              minimum_slope_percent: value(input, :minimum_slope_percent) || Validators::DrainageValidator::MIN_SLOPE_PERCENT
            )
            warnings = alternatives['requires_manual'] ? ['all automatic route candidates intersect known structural obstacles; manual intervention required'] : []
            { warnings: warnings, events: [{ name: 'DrainageRouteAlternativesPlanned', payload: alternatives }] }
          end
        end

        def register_create(runtime, planner, repository, geometry, validator)
          return if runtime.commands.registered?('CreateRoutedPipe')

          runtime.commands.register(
            'CreateRoutedPipe', owner_module: 'constructflow.drainage',
            validator: lambda { |command|
              begin
                plan = build_plan(runtime, planner, command[:input])
                Registration.pipe_route_validation_errors(route_input(command[:input], plan), runtime, validator)
              rescue StandardError => error
                [error.message]
              end
            }
          ) do |command|
            plan = build_plan(runtime, planner, command[:input])
            smart_object, definition, connection = Registration.create_pipe_route_object(runtime, repository, geometry, route_input(command[:input], plan))
            validation = validator.validate_route(definition)
            runtime.smart_objects.mark_dirty(smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: [smart_object.id],
              warnings: (plan.warnings + Registration.warning_messages(validation)).uniq,
              events: [
                { name: 'ObjectCreated', object_ids: [smart_object.id], payload: { type: 'drainage.pipe_route' } },
                { name: 'DrainageRoutePlanned', object_ids: [smart_object.id], payload: plan.to_h.merge('connection_id' => connection['id']) },
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

        def register_route_edits(runtime, service, repository, geometry, validator)
          register_edit_command(runtime, 'MoveDrainageRouteNode', service, repository, geometry, validator) do |definition, input|
            service.move(definition: definition, node_index: value(input, :node_index), position_mm: value(input, :position_mm), regrade: value(input, :regrade) == true)
          end
          register_edit_command(runtime, 'InsertDrainageRouteNode', service, repository, geometry, validator) do |definition, input|
            service.insert(definition: definition, after_index: value(input, :after_index), position_mm: value(input, :position_mm), regrade: value(input, :regrade) == true)
          end
          register_edit_command(runtime, 'RemoveDrainageRouteNode', service, repository, geometry, validator) do |definition, input|
            service.remove(definition: definition, node_index: value(input, :node_index), regrade: value(input, :regrade) == true)
          end
        end

        def register_edit_command(runtime, command_name, _service, repository, geometry, validator, &transform)
          return if runtime.commands.registered?(command_name)
          runtime.commands.register(command_name, owner_module: 'constructflow.drainage') do |command|
            input = command[:input]
            object = resolve_route(runtime, input)
            current = repository.read_pipe_route(object.entity)
            raise ArgumentError, 'drainage route definition missing' unless current
            updated = transform.call(current, input)
            issues = validator.validate_route(updated)
            errors = issues.select { |issue| issue[:severity] == 'error' }
            raise ArgumentError, errors.map { |issue| issue[:message] }.join('; ') unless errors.empty?
            geometry.rebuild_pipe!(object.entity, updated)
            repository.write_pipe_route(object.entity, updated)
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [object.id],
              warnings: Registration.warning_messages(issues),
              events: [
                { name: 'RouteChanged', object_ids: [object.id], payload: { route_strategy: updated.route_strategy, node_count: updated.route_nodes_mm.length } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] },
                { name: 'ValidationStateChanged', object_ids: [object.id], payload: { issues: issues } }
              ]
            }
          end
        end

        def resolve_route(runtime, input)
          object_id = value(input, :object_id).to_s
          raise ArgumentError, 'object_id required' if object_id.empty?
          object = runtime.smart_objects.fetch_by_id(object_id)
          raise ArgumentError, 'drainage pipe route not found' unless object && object.type == 'drainage.pipe_route' && object.owner_module == 'constructflow.drainage'
          object
        end

        def build_plan(runtime, planner, input)
          start_id = value(input, :start_connector_id).to_s
          end_id = value(input, :end_connector_id).to_s
          raise ArgumentError, 'start_connector_id required' if start_id.empty?
          raise ArgumentError, 'end_connector_id required' if end_id.empty?
          planner.plan(
            start_connector: runtime.connectors.connector(start_id), end_connector: runtime.connectors.connector(end_id),
            mode: value(input, :routing_mode) || value(input, :route_strategy) || 'semi_auto',
            via_nodes_mm: value(input, :via_nodes_mm) || value(input, :route_nodes_mm) || [],
            start_invert_mm: value(input, :start_invert_mm), end_invert_mm: value(input, :end_invert_mm),
            minimum_slope_percent: value(input, :minimum_slope_percent) || Validators::DrainageValidator::MIN_SLOPE_PERCENT,
            orthogonal_preference: value(input, :orthogonal_preference) || 'x_first'
          )
        end

        def route_input(input, plan)
          {
            system: value(input, :system) || 'waste', diameter_mm: value(input, :diameter_mm) || PipeRouteDefinition::DEFAULT_DIAMETER_MM,
            route_nodes_mm: plan.route_nodes_mm, start_connector_id: value(input, :start_connector_id), end_connector_id: value(input, :end_connector_id),
            start_invert_mm: plan.start_invert_mm, end_invert_mm: plan.end_invert_mm, material: value(input, :material) || 'pvc',
            route_strategy: plan.mode, display_name: value(input, :display_name), created_phase: value(input, :created_phase), source_state: value(input, :source_state)
          }
        end

        def value(input, key)
          input[key] || input[key.to_s]
        end
      end
    end
  end
end
