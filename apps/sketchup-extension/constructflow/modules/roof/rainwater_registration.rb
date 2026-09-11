# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      # Cross-domain orchestration only: Roof resolves the semantic gutter
      # outlet; Drainage owns the created downpipe object, topology and geometry.
      module RainwaterRegistration
        COMMAND = 'ConnectDownpipe'
        CAPABILITY = 'drainage.rainwater_downpipe'

        module_function

        def install(runtime)
          return if runtime.commands.registered?(COMMAND)

          repository = Repository.new
          runtime.commands.register(
            COMMAND,
            owner_module: 'constructflow.roof',
            validator: ->(command) { validation_errors(runtime, repository, command[:input]) }
          ) do |command|
            input = command[:input]
            gutter = resolve_gutter(runtime, input)
            gutter_definition = repository.read_gutter(gutter.entity)
            outlet_connector = selected_outlet_connector(runtime, gutter, gutter_definition, input)
            roof = runtime.smart_objects.fetch_by_id(gutter_definition.roof_object_id)
            service = runtime.capabilities.fetch(CAPABILITY)
            result = service.create(
              start_connector_id: outlet_connector['id'],
              end_connector_id: value(input, :target_connector_id),
              route_nodes_mm: value(input, :route_nodes_mm),
              diameter_mm: value(input, :diameter_mm) || Drainage::DownpipeDefinition::DEFAULT_DIAMETER_MM,
              material: value(input, :material) || 'pvc',
              route_strategy: value(input, :route_strategy) || 'direct',
              display_name: value(input, :display_name) || 'Rainwater Downpipe',
              source_state: value(input, :source_state) || gutter.source_state,
              created_phase: Core::Phase::NEW_CONSTRUCTION,
              generated_from_id: generated_from_extension_id(runtime, roof)
            )
            downpipe = result.fetch(:object)
            definition = result.fetch(:definition)
            connection = result.fetch(:connection)

            runtime.smart_objects.mark_dirty(gutter.entity, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(roof.entity, 'dirty_quantity', 'dirty_drawing') if roof
            affected = [gutter.id, roof&.id, downpipe.id].compact.uniq
            {
              created_object_ids: [downpipe.id],
              updated_object_ids: affected - [downpipe.id],
              events: [
                {
                  name: 'DownpipeConnected',
                  object_ids: affected,
                  payload: {
                    gutter_id: gutter.id,
                    outlet_connector_id: outlet_connector['id'],
                    downpipe_id: downpipe.id,
                    target_connector_id: definition.end_connector_id,
                    connection_id: connection['id']
                  }
                },
                {
                  name: 'DrainageTopologyChanged',
                  source_module: 'constructflow.drainage',
                  object_ids: [downpipe.id],
                  payload: { connection_id: connection['id'] }
                },
                { name: 'QuantityDirty', object_ids: affected },
                { name: 'DrawingDirty', object_ids: affected }
              ]
            }
          end
        end

        def validation_errors(runtime, repository, input)
          errors = []
          gutter = resolve_gutter(runtime, input)
          return ['roof gutter not found'] unless gutter
          definition = repository.read_gutter(gutter.entity)
          return ['gutter definition missing'] unless definition
          errors << 'target_connector_id required' if value(input, :target_connector_id).to_s.empty?
          errors << 'drainage rainwater downpipe capability unavailable' unless runtime.capabilities.available?(CAPABILITY)
          return errors unless errors.empty?

          outlet_connector = selected_outlet_connector(runtime, gutter, definition, input)
          target_connector = runtime.connectors.connector(value(input, :target_connector_id))
          service_system = Drainage::RainwaterDownpipeService::SYSTEM
          unless runtime.connectors.compatible?(outlet_connector['type'], target_connector['type'], system: service_system)
            errors << "incompatible rainwater destination: #{target_connector['type']}"
          end
          errors
        rescue KeyError => error
          ["rainwater connector not found: #{error.message}"]
        rescue StandardError => error
          [error.message]
        end

        def selected_outlet_connector(runtime, gutter, definition, input)
          requested = value(input, :outlet_connector_id).to_s.strip
          connector_id = requested.empty? ? definition.outlet_connector_id.to_s : requested
          raise ArgumentError, 'gutter outlet connector missing' if connector_id.empty?

          connector = runtime.connectors.connector(connector_id)
          raise ArgumentError, 'selected outlet connector is not owned by gutter' unless connector['owner_object_id'].to_s == gutter.id.to_s
          raise ArgumentError, 'selected connector is not a roof gutter outlet' unless connector['type'].to_s == 'roof.gutter_outlet'
          raise ArgumentError, 'selected gutter outlet is disabled' if connector['state'].to_s == 'disabled'

          connector
        end

        def resolve_gutter(runtime, input)
          entity = value(input, :entity) || value(input, :gutter_entity)
          object_id = value(input, :object_id) || value(input, :gutter_object_id)
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(object_id)
          return nil unless object && object.owner_module == 'constructflow.roof' && object.type == 'roof.gutter'
          object
        end

        def generated_from_extension_id(runtime, roof)
          return nil unless roof
          relation = Array(roof.relationships).find do |item|
            (item['kind'] || item[:kind]).to_s == 'generated_from'
          end
          target_id = relation && (relation['target_id'] || relation[:target_id]).to_s
          return nil if target_id.to_s.empty?
          target = runtime.smart_objects.fetch_by_id(target_id)
          target&.type == 'extension.zone' ? target.id : nil
        end

        def value(input, key)
          return input[key] if input.key?(key)
          input[key.to_s]
        end
      end
    end
  end
end
