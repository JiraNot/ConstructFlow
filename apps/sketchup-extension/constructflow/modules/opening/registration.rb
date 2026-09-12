# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Opening
      module Registration
        MANIFEST = {
          id: 'constructflow.opening',
          name: 'Opening & Void',
          version: '0.1.0',
          schema_version: 1,
          requires: %w[constructflow.core constructflow.architecture],
          optional_capabilities: %w[door_window.infill decorative.trim],
          provides: %w[opening.hosted_void opening.infill_host opening.quantity],
          objects: ['opening.rectangular'],
          commands: %w[CreateOpening ModifyOpening MarkUnresolvedOpeningHosts ResolveOpeningHost],
          events: %w[OpeningCreated OpeningModified OpeningHostUnresolved OpeningHostResolved RelationshipChanged GeometryChanged QuantityDirty DrawingDirty],
          providers: ['constructflow.opening.quantity'],
          validators: ['opening.hosted.validity']
        }.freeze

        module_function

        def install(runtime)
          return if runtime.modules.registered?('constructflow.opening')

          runtime.module_loader.load(MANIFEST)
          host_capability = runtime.capabilities.fetch('wall.host_surface')
          repository = OpeningRepository.new
          geometry = OpeningGeometry.new
          validator = Validators::OpeningValidator.new(host_capability: host_capability)
          quantity_provider = Quantity::OpeningQuantityProvider.new
          infill_host_capability = OpeningInfillHostCapability.new(
            repository: repository,
            object_resolver: ->(object_id) { runtime.smart_objects.fetch_by_id(object_id) },
            wall_host_capability: host_capability
          )

          runtime.capabilities.register(
            'opening.hosted_void',
            owner_module: 'constructflow.opening',
            provider: repository
          )
          runtime.capabilities.register(
            'opening.infill_host',
            owner_module: 'constructflow.opening',
            provider: infill_host_capability
          )
          runtime.capabilities.register(
            'opening.quantity',
            owner_module: 'constructflow.opening',
            provider: quantity_provider
          )

          runtime.commands.register(
            'CreateOpening',
            owner_module: 'constructflow.opening',
            validator: lambda { |command|
              create_validation_errors(command[:input], runtime, host_capability, validator)
            }
          ) do |command|
            input = command[:input]
            host = resolve_host(input, runtime, host_capability)
            definition = definition_from_input(input, host)
            group = geometry.create_group(
              runtime.active_model,
              host_object: host,
              definition: definition,
              host_capability: host_capability
            )
            smart_object = runtime.smart_objects.create(
              entity: group,
              type: 'opening.rectangular',
              owner_module: 'constructflow.opening',
              display_name: input[:display_name] || input['display_name'] || 'Opening',
              created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            repository.write(group, definition)
            role = host.created_phase == Core::Phase::EXISTING ? 'modifies_existing_host' : 'primary_host'
            runtime.smart_objects.add_relationship(
              group,
              kind: 'host',
              target_id: host.id,
              role: role,
              metadata: { 'capability' => 'wall.host_surface' }
            )
            host_capability.attach_opening(
              host,
              opening_id: smart_object.id,
              descriptor: definition.host_descriptor(opening_id: smart_object.id)
            )
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(host.entity, 'dirty_quantity', 'dirty_drawing')

            {
              created_object_ids: [smart_object.id],
              updated_object_ids: [host.id],
              events: [
                { name: 'ObjectCreated', object_ids: [smart_object.id], payload: { type: 'opening.rectangular' } },
                { name: 'OpeningCreated', object_ids: [smart_object.id, host.id], payload: { host_object_id: host.id } },
                { name: 'RelationshipChanged', object_ids: [smart_object.id, host.id], payload: { kind: 'host' } },
                { name: 'GeometryChanged', object_ids: [smart_object.id, host.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id, host.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id, host.id] }
              ]
            }
          end

          runtime.commands.register(
            'ModifyOpening',
            owner_module: 'constructflow.opening',
            validator: lambda { |command|
              modify_validation_errors(
                command[:input], runtime, repository, host_capability, validator, infill_host_capability
              )
            }
          ) do |command|
            input = command[:input]
            smart_object = resolve_opening(input, runtime)
            current = repository.read(smart_object.entity)
            host = runtime.smart_objects.fetch_by_id(current.host_object_id)
            updated = current.with(
              segment_index: value_or(input, :segment_index, current.segment_index),
              start_offset_mm: value_or(input, :start_offset_mm, current.start_offset_mm),
              width_mm: value_or(input, :width_mm, current.width_mm),
              height_mm: value_or(input, :height_mm, current.height_mm),
              sill_mm: value_or(input, :sill_mm, current.sill_mm)
            )

            host_capability.update_opening(
              host,
              opening_id: smart_object.id,
              descriptor: updated.host_descriptor(opening_id: smart_object.id)
            )
            geometry.rebuild!(
              smart_object.entity,
              host_object: host,
              definition: updated,
              host_capability: host_capability
            )
            repository.write(smart_object.entity, updated)
            runtime.smart_objects.mark_dirty(smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(host.entity, 'dirty_quantity', 'dirty_drawing')

            {
              updated_object_ids: [smart_object.id, host.id],
              events: [
                { name: 'OpeningModified', object_ids: [smart_object.id, host.id] },
                { name: 'ParametersChanged', object_ids: [smart_object.id] },
                { name: 'GeometryChanged', object_ids: [smart_object.id, host.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id, host.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id, host.id] }
              ]
            }
          end

          runtime.commands.register(
            'MarkUnresolvedOpeningHosts',
            owner_module: 'constructflow.opening'
          ) do |_command|
            unresolved = unresolved_host_openings(runtime, repository, host_capability)
            ids = unresolved.map do |entry|
              mark_unresolved_host!(
                runtime,
                entry[:object],
                host_object_id: entry[:host_object_id],
                reason: entry[:reason]
              )
            end
            {
              updated_object_ids: ids,
              events: [
                { name: 'OpeningHostUnresolved', object_ids: ids, payload: { count: ids.length } },
                { name: 'QuantityDirty', object_ids: ids },
                { name: 'DrawingDirty', object_ids: ids }
              ]
            }
          end

          runtime.commands.register(
            'ResolveOpeningHost',
            owner_module: 'constructflow.opening',
            validator: ->(command) { resolve_host_validation_errors(command[:input], runtime, host_capability, repository) }
          ) do |command|
            input = command[:input]
            smart_object = resolve_opening(input, runtime)
            current = repository.read(smart_object.entity)
            replacement = resolve_host(input, runtime, host_capability)
            updated = current.with(host_object_id: replacement.id)

            geometry.rebuild!(
              smart_object.entity,
              host_object: replacement,
              definition: updated,
              host_capability: host_capability
            )
            repository.write(smart_object.entity, updated)
            runtime.smart_objects.remove_relationship(
              smart_object.entity,
              kind: 'host',
              target_id: current.host_object_id
            )
            runtime.smart_objects.add_relationship(
              smart_object.entity,
              kind: 'host',
              target_id: replacement.id,
              role: replacement.created_phase == Core::Phase::EXISTING ? 'modifies_existing_host' : 'primary_host',
              metadata: { 'capability' => 'wall.host_surface', 'resolved_from' => current.host_object_id }
            )
            host_capability.attach_opening(
              replacement,
              opening_id: smart_object.id,
              descriptor: updated.host_descriptor(opening_id: smart_object.id)
            )
            runtime.smart_objects.update_status(smart_object.entity, 'active')
            runtime.smart_objects.update_revision_meta(
              smart_object.entity,
              resolved_revision_meta(smart_object, replacement.id)
            )
            runtime.smart_objects.mark_dirty(smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(replacement.entity, 'dirty_quantity', 'dirty_drawing')

            {
              updated_object_ids: [smart_object.id, replacement.id],
              events: [
                { name: 'OpeningModified', object_ids: [smart_object.id, replacement.id] },
                { name: 'OpeningHostResolved', object_ids: [smart_object.id, replacement.id], payload: { previous_host_object_id: current.host_object_id, host_object_id: replacement.id } },
                { name: 'RelationshipChanged', object_ids: [smart_object.id, replacement.id], payload: { kind: 'host', resolved: true } },
                { name: 'GeometryChanged', object_ids: [smart_object.id, replacement.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id, replacement.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id, replacement.id] }
              ]
            }
          end

          if runtime.respond_to?(:events)
            runtime.events.subscribe('GeometryChanged', owner: MANIFEST[:id]) do |event|
              next unless event[:source_module].to_s == 'constructflow.architecture'

              with_reconciliation_transaction(runtime, 'Reconcile hosted openings') do
                reconcile_wall_dependents(
                  runtime, repository, geometry, host_capability, event[:object_ids],
                  caused_by_command_id: event[:caused_by_command_id]
                )
              end
            end
          end

          install_ui(runtime)
        end

        def create_validation_errors(input, runtime, host_capability, validator)
          host = resolve_host(input, runtime, host_capability)
          return ['compatible wall host required'] unless host

          level_error = host_level_error(input, host)
          return [level_error] if level_error

          definition = definition_from_input(input, host)
          validator.validate(definition, host_object: host).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def host_level_error(input, host)
          requested_level_id = input[:level_id] || input['level_id']
          return unless requested_level_id && !requested_level_id.to_s.strip.empty?

          definition = Architecture::WallRepository.new.read(host.entity)
          host_level_id = definition && definition.base_level_id
          host_level_id ||= Array(host.level_refs).filter_map do |reference|
            reference.is_a?(Hash) ? (reference[:level_id] || reference['level_id']) : reference
          end.first
          return if host_level_id.nil? || host_level_id.to_s.empty?
          return if host_level_id.to_s == requested_level_id.to_s.strip

          'host Smart Wall is not on the requested plan level'
        rescue StandardError => error
          "unable to verify host Smart Wall level: #{error.message}"
        end

        def modify_validation_errors(input, runtime, repository, host_capability, validator, infill_host_capability)
          smart_object = resolve_opening(input, runtime)
          return ['opening not found'] unless smart_object

          current = repository.read(smart_object.entity)
          return ['opening definition missing'] unless current

          host = runtime.smart_objects.fetch_by_id(current.host_object_id)
          return ['opening host not found'] unless host_capability.compatible_host?(host)

          level_error = host_level_error(input, host)
          return [level_error] if level_error

          updated = current.with(
            segment_index: value_or(input, :segment_index, current.segment_index),
            start_offset_mm: value_or(input, :start_offset_mm, current.start_offset_mm),
            width_mm: value_or(input, :width_mm, current.width_mm),
            height_mm: value_or(input, :height_mm, current.height_mm),
            sill_mm: value_or(input, :sill_mm, current.sill_mm)
          )
          errors = validator.validate(updated, host_object: host).map { |issue| issue[:message] }
          infill = repository.infill_ref(smart_object.entity)
          if infill
            fit = infill_host_capability.fit_status(
              smart_object,
              width_mm: updated.width_mm,
              height_mm: updated.height_mm
            )
            errors << 'opening resize would invalidate attached infill' unless fit == 'exact_fit'
          end
          errors
        rescue StandardError => error
          [error.message]
        end

        def resolve_host_validation_errors(input, runtime, host_capability, repository)
          smart_object = resolve_opening(input, runtime)
          return ['opening not found'] unless smart_object

          current = repository.read(smart_object.entity)
          return ['opening definition missing'] unless current

          replacement_id = input[:replacement_host_object_id] || input['replacement_host_object_id'] || input[:host_object_id] || input['host_object_id']
          return ['replacement host object required'] if replacement_id.to_s.strip.empty?

          replacement = runtime.smart_objects.fetch_by_id(replacement_id)
          return ['compatible replacement wall host required'] unless host_capability.compatible_host?(replacement)

          level_error = host_level_error(input, replacement)
          return [level_error] if level_error

          definition = current.with(host_object_id: replacement.id)
          errors = host_capability.validate_opening(
            replacement,
            definition.host_descriptor(opening_id: smart_object.id)
          )
          Array(errors).map(&:to_s)
        rescue StandardError => error
          [error.message]
        end

        def definition_from_input(input, host)
          OpeningDefinition.new(
            host_object_id: host.id,
            segment_index: input[:segment_index] || input['segment_index'] || 0,
            start_offset_mm: input[:start_offset_mm] || input['start_offset_mm'] || 0,
            width_mm: input[:width_mm] || input['width_mm'] || OpeningDefinition::DEFAULT_WIDTH_MM,
            height_mm: input[:height_mm] || input['height_mm'] || OpeningDefinition::DEFAULT_HEIGHT_MM,
            sill_mm: input[:sill_mm] || input['sill_mm'] || OpeningDefinition::DEFAULT_SILL_MM
          )
        end

        def resolve_host(input, runtime, host_capability)
          entity = input[:host_entity] || input['host_entity']
          host = if entity
                   runtime.smart_objects.fetch(entity)
                 else
                   runtime.smart_objects.fetch_by_id(input[:host_object_id] || input['host_object_id'])
                 end
          host_capability.compatible_host?(host) ? host : nil
        end

        def resolve_opening(input, runtime)
          entity = input[:entity] || input['entity']
          object = if entity
                     runtime.smart_objects.fetch(entity)
                   else
                     runtime.smart_objects.fetch_by_id(input[:object_id] || input['object_id'])
                   end
          return nil unless object && object.type == 'opening.rectangular' && object.owner_module == 'constructflow.opening'

          object
        end

        def value_or(input, key, default)
          return input[key] if input.key?(key)
          string_key = key.to_s
          return input[string_key] if input.key?(string_key)

          default
        end

        def reconcile_wall_dependents(runtime, repository, geometry, host_capability, wall_ids,
                                      caused_by_command_id: nil)
          changed_openings = runtime.smart_objects.all.filter_map do |opening_object|
            next unless opening_object.type == 'opening.rectangular' && opening_object.owner_module == 'constructflow.opening'

            definition = repository.read(opening_object.entity)
            next unless definition && Array(wall_ids).map(&:to_s).include?(definition.host_object_id.to_s)

            host = runtime.smart_objects.fetch_by_id(definition.host_object_id)
            unless host && host.type == 'architecture.wall'
              mark_unresolved_host!(
                runtime,
                opening_object,
                host_object_id: definition.host_object_id,
                reason: host ? 'incompatible_host' : 'missing_host'
              )
              next opening_object.id
            end

            geometry.rebuild!(
              opening_object.entity,
              host_object: host,
              definition: definition,
              host_capability: host_capability
            )
            runtime.smart_objects.mark_dirty(opening_object.entity, 'dirty_quantity', 'dirty_drawing')
            opening_object.id
          rescue StandardError => error
            runtime.diagnostics&.warn('hosted_opening_rebuild_failed', error.message, object_id: opening_object.id)
            nil
          end
          return if changed_openings.empty?

          runtime.events.publish(
            'GeometryChanged',
            { change: 'host_geometry_reconciled' },
            source_module: MANIFEST[:id],
            object_ids: changed_openings,
            caused_by_command_id: caused_by_command_id
          )
        end

        def with_reconciliation_transaction(runtime, label)
          commands = runtime.respond_to?(:commands) ? runtime.commands : nil
          transaction_manager = commands && commands.respond_to?(:transaction_manager) ? commands.transaction_manager : nil
          return yield unless transaction_manager

          transaction_manager.run("ConstructFlow: #{label}") { yield }
        end

        def unresolved_host_openings(runtime, repository, host_capability)
          runtime.smart_objects.all.filter_map do |object|
            next unless object.type == 'opening.rectangular' && object.owner_module == 'constructflow.opening'

            definition = repository.read(object.entity)
            host = definition && runtime.smart_objects.fetch_by_id(definition.host_object_id)
            next if host && host_capability.compatible_host?(host)

            {
              object: object,
              host_object_id: definition&.host_object_id,
              reason: host ? 'incompatible_host' : 'missing_host'
            }
          rescue StandardError
            nil
          end
        end

        def mark_unresolved_host!(runtime, object, host_object_id:, reason:)
          runtime.smart_objects.update_status(object.entity, 'unresolved_host')
          meta = object.revision_meta.merge(
            'host_resolution' => {
              'status' => 'unresolved',
              'host_object_id' => host_object_id.to_s,
              'reason' => reason.to_s
            }
          )
          runtime.smart_objects.update_revision_meta(object.entity, meta)
          runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
          object.id
        end

        def resolved_revision_meta(object, host_object_id)
          object.revision_meta.merge(
            'host_resolution' => {
              'status' => 'resolved',
              'host_object_id' => host_object_id.to_s
            }
          )
        end

        def install_ui(runtime)
          menu = runtime.menu.add_submenu('Openings')
          menu.add_item('Scan Unresolved Opening Hosts') do
            result = runtime.commands.execute(
              'MarkUnresolvedOpeningHosts',
              {},
              project_id: runtime.project.project_id
            )
            message = if result[:status] == 'success'
                        "Marked #{result[:updated_object_ids].length} opening(s) for host resolution."
                      else
                        result[:errors].join("\n")
                      end
            UI.messagebox(message)
          rescue StandardError => error
            UI.messagebox("ConstructFlow Opening host scan error: #{error.message}")
          end
          menu.add_item('Place Rectangular Opening') do
            values = UI.inputbox(
              ['Width (mm)', 'Height (mm)', 'Sill (mm)', 'Base level ID (optional)'],
              ['900', '2100', '0', ''],
              'ConstructFlow Opening'
            )
            next unless values

            runtime.active_model.select_tool(
              Tools::OpeningTool.new(
                runtime: runtime,
                width_mm: Float(values[0]),
                height_mm: Float(values[1]),
                sill_mm: Float(values[2]),
                level_id: values[3]
              )
            )
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end
          menu.add_item('Edit Opening in Architecture Plan') do
            values = UI.inputbox(['Base level ID (optional)'], [''], 'ConstructFlow Opening Edit')
            next unless values

            runtime.active_model.select_tool(Tools::OpeningEditTool.new(runtime: runtime, level_id: values[0]))
          rescue StandardError => error
            UI.messagebox("ConstructFlow Opening edit error: #{error.message}")
          end
        end
      end
    end
  end
end
