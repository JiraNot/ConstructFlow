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

        def value(input, key)
          return input[key] if input.key?(key)
          input[key.to_s]
        end
      end
    end
  end
end
