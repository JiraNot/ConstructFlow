# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      module HostedGutterRegistration
        CAPABILITY = 'roof.hosted_gutter_regenerator'
        COMMAND = 'RegenerateHostedGutters'

        module_function

        def install(runtime)
          service = if runtime.capabilities.available?(CAPABILITY)
                      runtime.capabilities.fetch(CAPABILITY)
                    else
                      value = HostedGutterRegenerator.new(runtime: runtime)
                      runtime.capabilities.register(
                        CAPABILITY,
                        owner_module: 'constructflow.roof',
                        provider: value
                      )
                      subscribe_to_roof_changes(runtime)
                      value
                    end
          register_command(runtime, service)
          service
        end

        def register_command(runtime, service)
          return if runtime.commands.registered?(COMMAND)

          runtime.commands.register(
            COMMAND,
            owner_module: 'constructflow.roof',
            validator: lambda { |command|
              id = value(command[:input], :roof_object_id).to_s
              next ['roof_object_id required'] if id.empty?
              roof = runtime.smart_objects.fetch_by_id(id)
              roof && roof.owner_module == 'constructflow.roof' && roof.type == 'roof.system' ? [] : ['roof not found']
            }
          ) do |command|
            result = service.regenerate(roof_object_id: value(command[:input], :roof_object_id))
            regenerated = result['regenerated_gutter_ids']
            invalid = result['invalid_gutters']
            events = []
            unless regenerated.empty?
              events << {
                name: 'HostedGuttersRegenerated',
                object_ids: regenerated,
                payload: { roof_object_id: result['roof_object_id'] }
              }
              events << { name: 'GeometryChanged', object_ids: regenerated }
              events << { name: 'QuantityDirty', object_ids: regenerated }
              events << { name: 'DrawingDirty', object_ids: regenerated }
            end
            result['moved_outlets'].each do |moved|
              events << {
                name: 'GutterOutletMoved',
                object_ids: [moved['gutter_id']],
                payload: moved
              }
            end
            unless invalid.empty?
              events << {
                name: 'HostedGutterInvalid',
                object_ids: invalid.map { |item| item['gutter_id'] },
                payload: { roof_object_id: result['roof_object_id'], issues: invalid }
              }
            end
            {
              updated_object_ids: regenerated,
              warnings: invalid.map { |item| "#{item['gutter_id']}: #{item['message']}" },
              events: events
            }
          end
        end

        def subscribe_to_roof_changes(runtime)
          runtime.events.subscribe('RoofChanged', owner: 'constructflow.roof.hosted_gutter_regeneration') do |event|
            Array(event[:object_ids]).each do |roof_id|
              result = runtime.commands.execute(
                COMMAND,
                { roof_object_id: roof_id },
                actor: { kind: 'automation', id: 'roof-hosted-gutter-regeneration' },
                project_id: event[:project_id]
              )
              next if result[:status] == 'success'

              raise RuntimeError, "hosted gutter regeneration failed: #{Array(result[:errors]).join('; ')}"
            end
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
