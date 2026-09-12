# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      module RainwaterDownpipeRegistration
        CAPABILITY = 'drainage.rainwater_downpipe'
        COMMAND = 'CreateRainwaterDownpipe'

        module_function

        def install(runtime)
          register_connector_compatibility(runtime.connectors)
          service = RainwaterDownpipeService.new(runtime: runtime)

          unless runtime.capabilities.available?(CAPABILITY)
            runtime.capabilities.register(
              CAPABILITY,
              owner_module: 'constructflow.drainage',
              provider: service
            )
          end

          register_command(runtime, service)
          register_bridge_command(runtime, service)
          service
        end

        def register_connector_compatibility(connectors)
          connectors.register_compatibility(
            'roof.gutter_outlet', 'drainage.manhole_in',
            system: RainwaterDownpipeService::SYSTEM
          )
          connectors.register_compatibility(
            'roof.gutter_outlet', 'drainage.rainwater',
            system: RainwaterDownpipeService::SYSTEM
          )
          connectors.register_compatibility(
            'drainage.rainwater', 'drainage.manhole_in',
            system: RainwaterDownpipeService::SYSTEM
          )
          connectors.register_compatibility(
            'drainage.rainwater', 'drainage.rainwater',
            system: RainwaterDownpipeService::SYSTEM
          )
        end

        def register_command(runtime, service)
          return if runtime.commands.registered?(COMMAND)

          runtime.commands.register(
            COMMAND,
            owner_module: 'constructflow.drainage',
            validator: ->(command) { validation_errors(runtime, command[:input]) }
          ) do |command|
            input = command[:input]
            result = service.create(
              start_connector_id: value(input, :start_connector_id),
              end_connector_id: value(input, :end_connector_id),
              route_nodes_mm: value(input, :route_nodes_mm),
              diameter_mm: value(input, :diameter_mm) || DownpipeDefinition::DEFAULT_DIAMETER_MM,
              material: value(input, :material) || 'pvc',
              route_strategy: value(input, :route_strategy) || 'direct',
              display_name: value(input, :display_name) || 'Rainwater Downpipe',
              source_state: value(input, :source_state) || 'confirmed',
              created_phase: value(input, :created_phase),
              generated_from_id: value(input, :generated_from_id)
            )
            object = result.fetch(:object)
            definition = result.fetch(:definition)
            connection = result.fetch(:connection)
            {
              created_object_ids: [object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'drainage.downpipe' } },
                {
                  name: 'RainwaterDownpipeConnected',
                  object_ids: [object.id],
                  payload: {
                    connection_id: connection['id'],
                    start_connector_id: definition.start_connector_id,
                    end_connector_id: definition.end_connector_id
                  }
                },
                { name: 'DrainageTopologyChanged', object_ids: [object.id], payload: { connection_id: connection['id'] } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end
        end

        def validation_errors(runtime, input)
          start_id = value(input, :start_connector_id).to_s
          end_id = value(input, :end_connector_id).to_s
          errors = []
          errors << 'start_connector_id required' if start_id.empty?
          errors << 'end_connector_id required' if end_id.empty?
          return errors unless errors.empty?

          start_connector = runtime.connectors.connector(start_id)
          end_connector = runtime.connectors.connector(end_id)
          unless runtime.connectors.compatible?(
            start_connector['type'], end_connector['type'], system: RainwaterDownpipeService::SYSTEM
          )
            errors << "incompatible rainwater connectors: #{start_connector['type']} → #{end_connector['type']}"
          end
          unless runtime.connectors.connections_for_connector(start_id).empty?
            errors << 'gutter outlet already has an active rainwater connection'
          end
          errors << 'gutter outlet connector position required' if Array(start_connector['position_mm']).length < 3
          errors << 'rainwater destination connector position required' if Array(end_connector['position_mm']).length < 3
          errors
        rescue KeyError => error
          ["rainwater connector not found: #{error.message}"]
        rescue StandardError => error
          [error.message]
        end

        def register_bridge_command(runtime, service)
          command_name = 'ConnectDownpipeToDrainage'
          return if runtime.commands.registered?(command_name)

          runtime.commands.register(
            command_name,
            owner_module: 'constructflow.drainage'
          ) do |command|
            input = command[:input]
            downpipe_id = value(input, :downpipe_id).to_s
            target_connector_id = value(input, :target_connector_id)&.to_s

            downpipe_obj = if runtime.smart_objects.respond_to?(:fetch_by_id)
                             runtime.smart_objects.fetch_by_id(downpipe_id)
                           elsif runtime.smart_objects.respond_to?(:get)
                             runtime.smart_objects.get(downpipe_id)
                           end
            raise ArgumentError, "Downpipe #{downpipe_id} not found" unless downpipe_obj

            repo = Repository.new
            downpipe_def = repo.read_downpipe(downpipe_obj.entity)
            raise ArgumentError, "Object #{downpipe_id} is not a valid downpipe" unless downpipe_def

            start_conn_id = downpipe_def.end_connector_id
            start_conn = runtime.connectors.connector(start_conn_id)
            start_pos = start_conn['position_mm']

            if target_connector_id.nil? || target_connector_id.empty?
              all_conns = if runtime.connectors.respond_to?(:all_connectors)
                            runtime.connectors.all_connectors
                          elsif runtime.connectors.respond_to?(:connectors)
                            runtime.connectors.connectors.values
                          elsif runtime.connectors.respond_to?(:all)
                            runtime.connectors.all
                          else
                            []
                          end
              candidates = all_conns.select do |c|
                c['id'] != start_conn_id && %w[drainage.manhole_in drainage.rainwater].include?(c['type'])
              end
              raise ArgumentError, 'No compatible drainage connector found' if candidates.empty?

              target_conn = candidates.min_by do |c|
                pos = c['position_mm']
                Math.sqrt(((pos[0] - start_pos[0])**2) + ((pos[1] - start_pos[1])**2) + ((pos[2] - start_pos[2])**2))
              end
              target_connector_id = target_conn['id']
            else
              target_conn = runtime.connectors.connector(target_connector_id)
            end

            target_pos = target_conn['position_mm']
            route_nodes = [start_pos, target_pos]

            pipe_def = PipeRouteDefinition.new(
              system: 'rainwater',
              route_nodes_mm: route_nodes,
              start_connector_id: start_conn_id,
              end_connector_id: target_connector_id,
              diameter_mm: value(input, :diameter_mm) || downpipe_def.diameter_mm,
              start_invert_mm: start_pos[2],
              end_invert_mm: target_pos[2],
              material: value(input, :material) || downpipe_def.material,
              route_strategy: 'direct'
            )

            geometry = Geometry.new
            group = geometry.create_pipe_group(runtime.active_model, pipe_def)
            pipe_obj = runtime.smart_objects.create(
              entity: group,
              type: 'drainage.pipe_route',
              owner_module: 'constructflow.drainage',
              display_name: value(input, :display_name) || 'Rainwater Underground Pipe'
            )
            connection = runtime.connectors.register_connection(
              from_connector_id: start_conn_id,
              to_connector_id: target_connector_id,
              system: 'drainage.rainwater',
              metadata: { route_object_id: pipe_obj.id, route_kind: 'pipe_route' }
            )
            pipe_def = pipe_def.with(connection_id: connection['id'])
            repo.write_pipe_route(group, pipe_def)

            {
              created_object_ids: [pipe_obj.id],
              events: [
                { name: 'ObjectCreated', object_ids: [pipe_obj.id], payload: { type: 'drainage.pipe_route' } },
                { name: 'DownpipeToDrainageConnected', object_ids: [downpipe_obj.id, pipe_obj.id], payload: { pipe_object_id: pipe_obj.id, connection_id: connection['id'] } },
                { name: 'DrainageTopologyChanged', object_ids: [pipe_obj.id] },
                { name: 'GeometryChanged', object_ids: [pipe_obj.id] },
                { name: 'QuantityDirty', object_ids: [pipe_obj.id] }
              ]
            }
          end
        end

        def value(input, key)
          return input[key] if input.key?(key)
          input[key.to_s]
        end
      end
    end
  end
end
