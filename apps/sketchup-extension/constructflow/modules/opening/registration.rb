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
          commands: %w[CreateOpening ModifyOpening],
          events: %w[OpeningCreated OpeningModified RelationshipChanged GeometryChanged QuantityDirty DrawingDirty],
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

          install_ui(runtime)
        end

        def create_validation_errors(input, runtime, host_capability, validator)
          host = resolve_host(input, runtime, host_capability)
          return ['compatible wall host required'] unless host

          definition = definition_from_input(input, host)
          validator.validate(definition, host_object: host).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def modify_validation_errors(input, runtime, repository, host_capability, validator, infill_host_capability)
          smart_object = resolve_opening(input, runtime)
          return ['opening not found'] unless smart_object

          current = repository.read(smart_object.entity)
          return ['opening definition missing'] unless current

          host = runtime.smart_objects.fetch_by_id(current.host_object_id)
          return ['opening host not found'] unless host_capability.compatible_host?(host)

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

        def install_ui(runtime)
          menu = runtime.menu.add_submenu('Openings')
          menu.add_item('Place Rectangular Opening') do
            values = UI.inputbox(
              ['Width (mm)', 'Height (mm)', 'Sill (mm)'],
              ['900', '2100', '0'],
              'ConstructFlow Opening'
            )
            next unless values

            runtime.active_model.select_tool(
              Tools::OpeningTool.new(
                runtime: runtime,
                width_mm: Float(values[0]),
                height_mm: Float(values[1]),
                sill_mm: Float(values[2])
              )
            )
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end
        end
      end
    end
  end
end
