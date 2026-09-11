# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      module DownpipeEndpointSyncRegistration
        CAPABILITY = 'drainage.downpipe_endpoint_sync'
        COMMAND = 'SyncRainwaterDownpipesForConnector'

        module_function

        def install(runtime)
          service = if runtime.capabilities.available?(CAPABILITY)
                      runtime.capabilities.fetch(CAPABILITY)
                    else
                      value = DownpipeEndpointSyncService.new(runtime: runtime)
                      runtime.capabilities.register(
                        CAPABILITY,
                        owner_module: 'constructflow.drainage',
                        provider: value
                      )
                      subscribe_to_gutter_outlet_moves(runtime)
                      value
                    end
          register_command(runtime, service)
          service
        end

        def register_command(runtime, service)
          return if runtime.commands.registered?(COMMAND)

          runtime.commands.register(
            COMMAND,
            owner_module: 'constructflow.drainage',
            validator: lambda { |command|
              id = value(command[:input], :connector_id).to_s
              id.empty? ? ['connector_id required'] : []
            }
          ) do |command|
            result = service.sync_connector(connector_id: value(command[:input], :connector_id))
            updated = result['updated_downpipe_ids']
            invalid = result['invalid_downpipes']
            events = []
            unless updated.empty?
              events << {
                name: 'RainwaterDownpipeEndpointSynced',
                object_ids: updated,
                payload: { connector_id: result['connector_id'] }
              }
              events << { name: 'GeometryChanged', object_ids: updated }
              events << { name: 'QuantityDirty', object_ids: updated }
              events << { name: 'DrawingDirty', object_ids: updated }
              events << { name: 'DrainageTopologyChanged', object_ids: updated }
            end
            unless invalid.empty?
              events << {
                name: 'ValidationStateChanged',
                object_ids: invalid.map { |item| item['downpipe_id'] },
                payload: { issues: invalid }
              }
            end
            {
              updated_object_ids: updated,
              warnings: invalid.map { |item| "#{item['downpipe_id']}: #{item['message']}" },
              events: events
            }
          end
        end

        def subscribe_to_gutter_outlet_moves(runtime)
          runtime.events.subscribe('GutterOutletMoved', owner: 'constructflow.drainage.downpipe_endpoint_sync') do |event|
            connector_id = event.dig(:payload, 'connector_id') || event.dig(:payload, :connector_id)
            result = runtime.commands.execute(
              COMMAND,
              { connector_id: connector_id },
              actor: { kind: 'automation', id: 'downpipe-endpoint-sync' },
              project_id: event[:project_id]
            )
            next if result[:status] == 'success'

            raise RuntimeError, "downpipe endpoint sync failed: #{Array(result[:errors]).join('; ')}"
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
