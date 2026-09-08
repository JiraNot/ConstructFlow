# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      module Registration
        MANIFEST = {
          id: 'constructflow.drainage',
          name: 'Drainage',
          version: '0.1.0',
          schema_version: 1,
          requires: ['constructflow.core'],
          optional_capabilities: %w[site.utility_destination structure.coordination surface.drainage drawing.provider],
          provides: %w[drainage.network drainage.quantity],
          objects: %w[drainage.manhole drainage.pipe_route],
          commands: %w[PlaceManhole CreatePipeRoute EditPipeRoute RelocateManhole],
          events: %w[DrainageNodeRelocated DrainageTopologyChanged RouteChanged GeometryChanged QuantityDirty DrawingDirty ValidationStateChanged],
          providers: ['constructflow.drainage.quantity'],
          validators: %w[drainage.manhole.validity drainage.route.gravity]
        }.freeze

        module_function

        def install(runtime)
          return if runtime.modules.registered?('constructflow.drainage')

          runtime.module_loader.load(MANIFEST)
          repository = Repository.new
          geometry = Geometry.new
          validator = Validators::DrainageValidator.new
          quantity_provider = Quantity::DrainageQuantityProvider.new

          register_connector_rules(runtime.connectors)
          runtime.capabilities.register(
            'drainage.network',
            owner_module: 'constructflow.drainage',
            provider: runtime.connectors
          )
          runtime.capabilities.register(
            'drainage.quantity',
            owner_module: 'constructflow.drainage',
            provider: quantity_provider
          )

          runtime.commands.register(
            'PlaceManhole',
            owner_module: 'constructflow.drainage',
            validator: ->(command) { manhole_validation_errors(command[:input], validator) }
          ) do |command|
            smart_object, definition = create_manhole_object(
              runtime, repository, geometry, command[:input]
            )
            runtime.smart_objects.mark_dirty(smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: [smart_object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [smart_object.id], payload: { type: 'drainage.manhole' } },
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'DrainageTopologyChanged', object_ids: [smart_object.id], payload: connector_payload(definition) },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          runtime.commands.register(
            'CreatePipeRoute',
            owner_module: 'constructflow.drainage',
            validator: ->(command) { pipe_route_validation_errors(command[:input], runtime, validator) }
          ) do |command|
            smart_object, definition, connection = create_pipe_route_object(
              runtime, repository, geometry, command[:input]
            )
            validation = validator.validate_route(definition)
            runtime.smart_objects.mark_dirty(smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: [smart_object.id],
              warnings: warning_messages(validation),
              events: [
                { name: 'ObjectCreated', object_ids: [smart_object.id], payload: { type: 'drainage.pipe_route' } },
                { name: 'DrainageTopologyChanged', object_ids: [smart_object.id], payload: { connection_id: connection['id'] } },
                { name: 'RouteChanged', object_ids: [smart_object.id] },
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] },
                { name: 'ValidationStateChanged', object_ids: [smart_object.id], payload: { issues: validation } }
              ]
            }
          end

          runtime.commands.register(
            'EditPipeRoute',
            owner_module: 'constructflow.drainage',
            validator: ->(command) { edit_route_validation_errors(command[:input], runtime, repository, validator) }
          ) do |command|
            input = command[:input]
            smart_object = resolve_pipe_route(input, runtime)
            current = repository.read_pipe_route(smart_object.entity)
            updated = current.with(
              route_nodes_mm: value_or(input, :route_nodes_mm, current.route_nodes_mm),
              diameter_mm: value_or(input, :diameter_mm, current.diameter_mm),
              start_invert_mm: value_or(input, :start_invert_mm, current.start_invert_mm),
              end_invert_mm: value_or(input, :end_invert_mm, current.end_invert_mm),
              material: value_or(input, :material, current.material),
              route_strategy: value_or(input, :route_strategy, current.route_strategy)
            )
            geometry.rebuild_pipe!(smart_object.entity, updated)
            repository.write_pipe_route(smart_object.entity, updated)
            validation = validator.validate_route(updated)
            runtime.smart_objects.mark_dirty(smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [smart_object.id],
              warnings: warning_messages(validation),
              events: [
                { name: 'RouteChanged', object_ids: [smart_object.id] },
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] },
                { name: 'ValidationStateChanged', object_ids: [smart_object.id], payload: { issues: validation } }
              ]
            }
          end

          runtime.commands.register(
            'RelocateManhole',
            owner_module: 'constructflow.drainage',
            validator: ->(command) { relocation_validation_errors(command[:input], runtime, repository, validator) }
          ) do |command|
            relocate_manhole(
              runtime: runtime,
              repository: repository,
              geometry: geometry,
              validator: validator,
              input: command[:input]
            )
          end

          install_ui(runtime)
        end

        def register_connector_rules(connectors)
          connectors.register_compatibility('drainage.manhole_out', 'drainage.manhole_in')
          connectors.register_compatibility('drainage.waste', 'drainage.manhole_in')
          connectors.register_compatibility('drainage.manhole_out', 'drainage.waste')
          connectors.register_compatibility('drainage.soil', 'drainage.manhole_in')
          connectors.register_compatibility('drainage.manhole_out', 'drainage.soil')
          connectors.register_compatibility('drainage.rainwater', 'drainage.manhole_in')
          connectors.register_compatibility('drainage.manhole_out', 'drainage.rainwater')
        end

        def create_manhole_object(runtime, repository, geometry, input, created_phase: nil)
          definition = manhole_definition_from_input(input)
          group = geometry.create_manhole_group(runtime.active_model, definition)
          smart_object = runtime.smart_objects.create(
            entity: group,
            type: 'drainage.manhole',
            owner_module: 'constructflow.drainage',
            display_name: input[:display_name] || input['display_name'] || 'Manhole',
            created_phase: created_phase || input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
            source_state: input[:source_state] || input['source_state'] || 'confirmed'
          )

          inlet = runtime.connectors.register_connector(
            owner_object_id: smart_object.id,
            type: 'drainage.manhole_in',
            role: 'inlet',
            nominal_size_mm: input[:nominal_size_mm] || input['nominal_size_mm'] || 100,
            position_mm: connector_position(definition, definition.invert_in_mm),
            properties: { invert_mm: definition.invert_in_mm, gravity: true }
          )
          outlet = runtime.connectors.register_connector(
            owner_object_id: smart_object.id,
            type: 'drainage.manhole_out',
            role: 'outlet',
            nominal_size_mm: input[:nominal_size_mm] || input['nominal_size_mm'] || 100,
            position_mm: connector_position(definition, definition.invert_out_mm),
            properties: { invert_mm: definition.invert_out_mm, gravity: true }
          )
          definition = definition.with(
            inlet_connector_id: inlet['id'],
            outlet_connector_id: outlet['id']
          )
          repository.write_manhole(group, definition)
          [smart_object, definition]
        end

        def create_pipe_route_object(runtime, repository, geometry, input, created_phase: nil)
          definition = pipe_route_definition_from_input(input, runtime)
          group = geometry.create_pipe_group(runtime.active_model, definition)
          smart_object = runtime.smart_objects.create(
            entity: group,
            type: 'drainage.pipe_route',
            owner_module: 'constructflow.drainage',
            display_name: input[:display_name] || input['display_name'] || 'Drainage Route',
            created_phase: created_phase || input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
            source_state: input[:source_state] || input['source_state'] || route_source_state(definition)
          )
          connection = runtime.connectors.register_connection(
            from_connector_id: definition.start_connector_id,
            to_connector_id: definition.end_connector_id,
            system: "drainage.#{definition.system}",
            metadata: { route_object_id: smart_object.id }
          )
          definition = definition.with(connection_id: connection['id'])
          repository.write_pipe_route(group, definition)

          [definition.start_connector_id, definition.end_connector_id].each do |connector_id|
            owner_id = runtime.connectors.connector(connector_id)['owner_object_id']
            runtime.smart_objects.add_relationship(
              group,
              kind: 'connects_to',
              target_id: owner_id,
              role: 'drainage_endpoint',
              metadata: { connector_id: connector_id }
            )
          end
          [smart_object, definition, connection]
        end

        def relocate_manhole(runtime:, repository:, geometry:, validator:, input:)
          old_object = resolve_manhole(input, runtime)
          old_definition = repository.read_manhole(old_object.entity)
          connected = runtime.connectors.connections_for_object(old_object.id)
          runtime.smart_objects.update_lifecycle(
            old_object.entity,
            removed_phase: Core::Phase::DEMOLITION
          )
          runtime.smart_objects.mark_dirty(old_object.entity, 'dirty_quantity', 'dirty_drawing')

          new_input = {
            location_mm: input[:new_location_mm] || input['new_location_mm'],
            size_mm: value_or(input, :size_mm, old_definition.size_mm),
            cover_level_mm: value_or(input, :cover_level_mm, old_definition.cover_level_mm),
            invert_in_mm: value_or(input, :invert_in_mm, old_definition.invert_in_mm),
            invert_out_mm: value_or(input, :invert_out_mm, old_definition.invert_out_mm),
            manhole_type: value_or(input, :manhole_type, old_definition.manhole_type),
            source_state: input[:source_state] || input['source_state'] || old_object.source_state,
            display_name: input[:display_name] || input['display_name'] || "#{old_object.display_name} Relocated"
          }
          new_object, new_definition = create_manhole_object(
            runtime,
            repository,
            geometry,
            new_input,
            created_phase: Core::Phase::NEW_CONSTRUCTION
          )
          runtime.smart_objects.add_relationship(
            old_object.entity,
            kind: 'replaced_by',
            target_id: new_object.id,
            role: 'relocation'
          )
          runtime.smart_objects.add_relationship(
            new_object.entity,
            kind: 'replaces',
            target_id: old_object.id,
            role: 'relocation'
          )

          created_ids = [new_object.id]
          updated_ids = [old_object.id, new_object.id]
          route_warnings = []
          connected.each do |connection|
            route_object_id = connection.fetch('metadata', {})['route_object_id']
            route_object = route_object_id && runtime.smart_objects.fetch_by_id(route_object_id)
            old_connector_id = old_endpoint_connector(connection, old_definition)
            next unless old_connector_id

            new_connector_id = replacement_connector_id(
              runtime,
              old_connector_id,
              new_definition
            )

            if route_object && route_object.type == 'drainage.pipe_route'
              route_definition = repository.read_pipe_route(route_object.entity)
              replacement_definition = relocate_route_definition(
                runtime,
                route_definition,
                old_connector_id: old_connector_id,
                new_connector_id: new_connector_id
              )

              if route_object.created_phase == Core::Phase::EXISTING
                runtime.smart_objects.update_lifecycle(
                  route_object.entity,
                  removed_phase: Core::Phase::DEMOLITION
                )
                runtime.smart_objects.mark_dirty(route_object.entity, 'dirty_quantity', 'dirty_drawing')
                runtime.connectors.disconnect(connection['id'])
                new_route, new_route_definition, = create_pipe_route_object(
                  runtime,
                  repository,
                  geometry,
                  replacement_definition.to_h,
                  created_phase: Core::Phase::NEW_CONSTRUCTION
                )
                runtime.smart_objects.add_relationship(
                  route_object.entity,
                  kind: 'replaced_by',
                  target_id: new_route.id,
                  role: 'reroute'
                )
                runtime.smart_objects.add_relationship(
                  new_route.entity,
                  kind: 'replaces',
                  target_id: route_object.id,
                  role: 'reroute'
                )
                runtime.smart_objects.mark_dirty(new_route.entity, 'dirty_quantity', 'dirty_drawing')
                created_ids << new_route.id
                updated_ids.concat([route_object.id, new_route.id])
                route_warnings.concat(warning_messages(validator.validate_route(new_route_definition)))
              else
                runtime.connectors.replace_endpoint(
                  connection['id'],
                  old_connector_id: old_connector_id,
                  new_connector_id: new_connector_id
                )
                replacement_definition = replacement_definition.with(connection_id: connection['id'])
                geometry.rebuild_pipe!(route_object.entity, replacement_definition)
                repository.write_pipe_route(route_object.entity, replacement_definition)
                runtime.smart_objects.mark_dirty(route_object.entity, 'dirty_quantity', 'dirty_drawing')
                updated_ids << route_object.id
                route_warnings.concat(warning_messages(validator.validate_route(replacement_definition)))
              end
            else
              runtime.connectors.replace_endpoint(
                connection['id'],
                old_connector_id: old_connector_id,
                new_connector_id: new_connector_id
              )
            end
          end
          runtime.connectors.disable_connectors_for(old_object.id)
          runtime.smart_objects.mark_dirty(new_object.entity, 'dirty_quantity', 'dirty_drawing')

          affected = updated_ids.uniq.freeze
          {
            created_object_ids: created_ids.uniq,
            updated_object_ids: affected,
            warnings: route_warnings.uniq,
            events: [
              { name: 'ObjectDemolished', object_ids: [old_object.id] },
              { name: 'ObjectCreated', object_ids: [new_object.id], payload: { type: 'drainage.manhole' } },
              { name: 'ConstructionObjectReplaced', object_ids: [old_object.id, new_object.id], payload: { reason: 'relocation' } },
              { name: 'DrainageNodeRelocated', object_ids: [old_object.id, new_object.id], payload: { old_id: old_object.id, new_id: new_object.id } },
              { name: 'DrainageTopologyChanged', object_ids: affected },
              { name: 'QuantityDirty', object_ids: affected },
              { name: 'DrawingDirty', object_ids: affected },
              { name: 'ValidationStateChanged', object_ids: affected, payload: { warnings: route_warnings.uniq } }
            ]
          }
        end

        def manhole_validation_errors(input, validator)
          validator.validate_manhole(manhole_definition_from_input(input))
                   .select { |issue| issue[:severity] == 'error' }
                   .map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def pipe_route_validation_errors(input, runtime, validator)
          definition = pipe_route_definition_from_input(input, runtime)
          errors = validator.validate_route(definition)
                            .select { |issue| issue[:severity] == 'error' }
                            .map { |issue| issue[:message] }
          start = runtime.connectors.connector(definition.start_connector_id)
          finish = runtime.connectors.connector(definition.end_connector_id)
          unless runtime.connectors.compatible?(
            start['type'], finish['type'], system: "drainage.#{definition.system}"
          )
            errors << "incompatible drainage connectors: #{start['type']} → #{finish['type']}"
          end
          errors
        rescue StandardError => error
          [error.message]
        end

        def edit_route_validation_errors(input, runtime, repository, validator)
          smart_object = resolve_pipe_route(input, runtime)
          return ['drainage route not found'] unless smart_object

          current = repository.read_pipe_route(smart_object.entity)
          return ['drainage route definition missing'] unless current

          candidate = current.with(
            route_nodes_mm: value_or(input, :route_nodes_mm, current.route_nodes_mm),
            diameter_mm: value_or(input, :diameter_mm, current.diameter_mm),
            start_invert_mm: value_or(input, :start_invert_mm, current.start_invert_mm),
            end_invert_mm: value_or(input, :end_invert_mm, current.end_invert_mm),
            material: value_or(input, :material, current.material),
            route_strategy: value_or(input, :route_strategy, current.route_strategy)
          )
          validator.validate_route(candidate)
                   .select { |issue| issue[:severity] == 'error' }
                   .map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def relocation_validation_errors(input, runtime, repository, validator)
          object = resolve_manhole(input, runtime)
          return ['existing manhole not found'] unless object
          return ['RelocateManhole requires an Existing manhole'] unless object.created_phase == Core::Phase::EXISTING
          return ['manhole is already demolished'] if object.removed_phase == Core::Phase::DEMOLITION

          old = repository.read_manhole(object.entity)
          return ['manhole definition missing'] unless old

          candidate = old.with(
            location_mm: input[:new_location_mm] || input['new_location_mm'],
            size_mm: value_or(input, :size_mm, old.size_mm),
            cover_level_mm: value_or(input, :cover_level_mm, old.cover_level_mm),
            invert_in_mm: value_or(input, :invert_in_mm, old.invert_in_mm),
            invert_out_mm: value_or(input, :invert_out_mm, old.invert_out_mm),
            manhole_type: value_or(input, :manhole_type, old.manhole_type),
            inlet_connector_id: nil,
            outlet_connector_id: nil
          )
          validator.validate_manhole(candidate).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def manhole_definition_from_input(input)
          ManholeDefinition.new(
            location_mm: input[:location_mm] || input['location_mm'],
            size_mm: input[:size_mm] || input['size_mm'] || ManholeDefinition::DEFAULT_SIZE_MM,
            cover_level_mm: input[:cover_level_mm] || input['cover_level_mm'],
            invert_in_mm: input[:invert_in_mm] || input['invert_in_mm'],
            invert_out_mm: input[:invert_out_mm] || input['invert_out_mm'],
            manhole_type: input[:manhole_type] || input['manhole_type'] || 'generic'
          )
        end

        def pipe_route_definition_from_input(input, runtime)
          start_id = input[:start_connector_id] || input['start_connector_id']
          end_id = input[:end_connector_id] || input['end_connector_id']
          start_connector = runtime.connectors.connector(start_id)
          end_connector = runtime.connectors.connector(end_id)
          nodes = input[:route_nodes_mm] || input['route_nodes_mm'] || [
            start_connector['position_mm'], end_connector['position_mm']
          ]
          raise ArgumentError, 'connector position is unknown; provide route_nodes_mm' if nodes.any?(&:nil?)

          PipeRouteDefinition.new(
            system: input[:system] || input['system'] || 'waste',
            diameter_mm: input[:diameter_mm] || input['diameter_mm'] || start_connector['nominal_size_mm'] || 100,
            route_nodes_mm: nodes,
            start_connector_id: start_id,
            end_connector_id: end_id,
            start_invert_mm: value_or(input, :start_invert_mm, connector_invert(start_connector)),
            end_invert_mm: value_or(input, :end_invert_mm, connector_invert(end_connector)),
            material: input[:material] || input['material'] || 'pvc',
            route_strategy: input[:route_strategy] || input['route_strategy'] || 'manual',
            connection_id: input[:connection_id] || input['connection_id']
          )
        end

        def relocate_route_definition(runtime, definition, old_connector_id:, new_connector_id:)
          nodes = definition.route_nodes_mm.map(&:dup)
          new_connector = runtime.connectors.connector(new_connector_id)
          if definition.start_connector_id == old_connector_id.to_s
            nodes[0] = new_connector['position_mm'] || nodes[0]
            definition.with(
              start_connector_id: new_connector_id,
              route_nodes_mm: nodes,
              start_invert_mm: connector_invert(new_connector),
              connection_id: nil
            )
          elsif definition.end_connector_id == old_connector_id.to_s
            nodes[-1] = new_connector['position_mm'] || nodes[-1]
            definition.with(
              end_connector_id: new_connector_id,
              route_nodes_mm: nodes,
              end_invert_mm: connector_invert(new_connector),
              connection_id: nil
            )
          else
            definition
          end
        end

        def old_endpoint_connector(connection, manhole_definition)
          ids = [manhole_definition.inlet_connector_id, manhole_definition.outlet_connector_id].compact
          ids.find do |id|
            connection['from_connector_id'] == id || connection['to_connector_id'] == id
          end
        end

        def replacement_connector_id(runtime, old_connector_id, new_definition)
          old = runtime.connectors.connector(old_connector_id)
          old['role'] == 'outlet' ? new_definition.outlet_connector_id : new_definition.inlet_connector_id
        end

        def resolve_manhole(input, runtime)
          object = resolve_domain_object(input, runtime)
          object if object && object.type == 'drainage.manhole' && object.owner_module == 'constructflow.drainage'
        end

        def resolve_pipe_route(input, runtime)
          object = resolve_domain_object(input, runtime)
          object if object && object.type == 'drainage.pipe_route' && object.owner_module == 'constructflow.drainage'
        end

        def resolve_domain_object(input, runtime)
          entity = input[:entity] || input['entity']
          return runtime.smart_objects.fetch(entity) if entity

          object_id = input[:object_id] || input['object_id']
          object_id ? runtime.smart_objects.fetch_by_id(object_id) : nil
        end

        def connector_position(definition, invert_mm)
          x, y, z = definition.location_mm
          [x, y, invert_mm.nil? ? z : invert_mm]
        end

        def connector_invert(connector)
          connector.fetch('properties', {})['invert_mm']
        end

        def connector_payload(definition)
          {
            inlet_connector_id: definition.inlet_connector_id,
            outlet_connector_id: definition.outlet_connector_id
          }
        end

        def route_source_state(definition)
          definition.invert_known? ? 'confirmed' : 'verify_on_site'
        end

        def warning_messages(issues)
          Array(issues).select { |issue| issue[:severity] == 'warning' }
                       .map { |issue| issue[:message].to_s }
        end

        def value_or(input, key, default)
          return input[key] if input.key?(key)
          string_key = key.to_s
          return input[string_key] if input.key?(string_key)

          default
        end

        def install_ui(runtime)
          menu = runtime.menu.add_submenu('Drainage')
          menu.add_item('Place Manhole') do
            values = UI.inputbox(
              ['Size (mm)', 'Cover level mm (blank=unknown)', 'Invert in mm (blank=unknown)', 'Invert out mm (blank=unknown)'],
              ['600', '', '', ''],
              'ConstructFlow Manhole'
            )
            next unless values

            runtime.active_model.select_tool(
              Tools::ManholeTool.new(
                runtime: runtime,
                size_mm: [Float(values[0]), Float(values[0])],
                cover_level_mm: optional_ui_float(values[1]),
                invert_in_mm: optional_ui_float(values[2]),
                invert_out_mm: optional_ui_float(values[3])
              )
            )
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end

          menu.add_item('Connect Selected Manholes') do
            manholes = selected_manhole_objects(runtime)
            if manholes.length != 2
              UI.messagebox('Select exactly two ConstructFlow manholes: upstream then downstream.')
              next
            end
            upstream, downstream = manholes
            start_id = runtime.connectors.connectors_for(upstream.id).find { |item| item['role'] == 'outlet' }&.dig('id')
            end_id = runtime.connectors.connectors_for(downstream.id).find { |item| item['role'] == 'inlet' }&.dig('id')
            result = runtime.commands.execute(
              'CreatePipeRoute',
              { start_connector_id: start_id, end_connector_id: end_id, system: 'waste' },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
          end

          menu.add_item('Relocate Selected Manhole') do
            manholes = selected_manhole_objects(runtime)
            if manholes.length != 1
              UI.messagebox('Select one Existing ConstructFlow manhole first.')
              next
            end
            runtime.active_model.select_tool(
              Tools::RelocateManholeTool.new(runtime: runtime, manhole_object_id: manholes.first.id)
            )
          end
        end

        def selected_manhole_objects(runtime)
          runtime.active_model.selection.filter_map do |entity|
            object = runtime.smart_objects.fetch(entity)
            object if object && object.type == 'drainage.manhole' && object.owner_module == 'constructflow.drainage'
          end
        end

        def optional_ui_float(value)
          text = value.to_s.strip
          text.empty? ? nil : Float(text)
        end
      end
    end
  end
end
