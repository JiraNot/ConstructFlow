# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      module Registration
        MANIFEST = {
          id: 'constructflow.door_window',
          name: 'Door & Window',
          version: '0.1.0',
          schema_version: 1,
          requires: %w[constructflow.core constructflow.opening],
          optional_capabilities: %w[library.catalog drawing.provider],
          provides: %w[door_window.infill door_window.quantity],
          objects: ['door_window.instance'],
          commands: %w[CreateDoorWindow PlaceDoorWindowOnWall ModifyDoorWindowInstance EditDoorWindowSchedule SwapDoorWindowType ChangePanelConfiguration ChangeFrameSystem MakeUniqueType],
          events: %w[DoorWindowAttached DoorWindowTypeChanged DoorWindowInstanceChanged GeometryChanged QuantityDirty DrawingDirty ScheduleDirty],
          providers: ['constructflow.door_window.quantity'],
          validators: ['door_window.opening_fit']
        }.freeze

        module_function

        DOOR_WINDOW_SCHEDULE = Core::ScheduleDefinition.new(
          id: 'door_window.schedule',
          name: 'Door / Window Schedule',
          object_type: 'door_window.instance',
          columns: [
            { id: 'schedule_mark', label: 'Mark', field_type: 'text', editable: true, scope: 'instance' },
            { id: 'handing', label: 'Handing', field_type: 'text', editable: true, scope: 'instance' },
            { id: 'type_id', label: 'Type', field_type: 'text', editable: true, scope: 'instance' },
            { id: 'frame_material', label: 'Frame', field_type: 'text', editable: true, scope: 'type' },
            { id: 'width_mm', label: 'Width (mm)', field_type: 'number', calculated: true },
            { id: 'height_mm', label: 'Height (mm)', field_type: 'number', calculated: true },
            { id: 'area_mm2', label: 'Area (mm²)', field_type: 'number', calculated: true }
          ]
        ).freeze

        def schedule_editor(runtime)
          repository = InstanceRepository.new
          Core::ScheduleEditor.new(
            schema: DOOR_WINDOW_SCHEDULE,
            row_provider: lambda { |object|
              instance = repository.read(object.entity)
              type = TypeRegistry.new(runtime.active_model).fetch(instance.type_id)
              {
                schedule_mark: instance.schedule_mark,
                handing: instance.handing,
                type_id: type.id,
                frame_material: type.frame_material,
                width_mm: type.width_mm,
                height_mm: type.height_mm,
                area_mm2: type.width_mm * type.height_mm
              }
            },
            updater: lambda { |change| schedule_update_result(runtime, change) }
          )
        end

        def install(runtime)
          return if runtime.modules.registered?('constructflow.door_window')

          runtime.module_loader.load(MANIFEST)
          opening_host = runtime.capabilities.fetch('opening.infill_host')
          wall_host = runtime.capabilities.fetch('wall.host_surface')
          repository = InstanceRepository.new
          geometry = DoorWindowGeometry.new
          validator = Validators::DoorWindowValidator.new(opening_host_capability: opening_host)
          quantity_provider = Quantity::DoorWindowQuantityProvider.new

          runtime.capabilities.register(
            'door_window.infill',
            owner_module: 'constructflow.door_window',
            provider: repository
          )
          runtime.capabilities.register(
            'door_window.quantity',
            owner_module: 'constructflow.door_window',
            provider: quantity_provider
          )

          runtime.commands.register(
            'CreateDoorWindow',
            owner_module: 'constructflow.door_window',
            validator: lambda { |command|
              create_validation_errors(command[:input], runtime, opening_host, validator)
            }
          ) do |command|
            input = command[:input]
            opening = resolve_opening(input, runtime, opening_host)
            registry = TypeRegistry.new(runtime.active_model)
            type = resolve_or_register_type(input, registry, opening_host.dimensions(opening))
            instance = InstanceDefinition.new(
              type_id: type.id,
              opening_object_id: opening.id,
              handing: input[:handing] || input['handing'] || 'default',
              schedule_mark: input[:schedule_mark] || input['schedule_mark'],
              parameters: input[:parameters] || input['parameters'] || input[:parametric_parameters] || input['parametric_parameters'] || {}
            )
            group = geometry.create_group(
              runtime.active_model,
              opening_object: opening,
              type: type,
              opening_host_capability: opening_host,
              instance_parameters: instance.parameters
            )
            smart_object = runtime.smart_objects.create(
              entity: group,
              type: 'door_window.instance',
              owner_module: 'constructflow.door_window',
              display_name: input[:display_name] || input['display_name'] || type.name,
              created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            repository.write(group, instance)
            runtime.smart_objects.add_relationship(
              group,
              kind: 'host',
              target_id: opening.id,
              role: 'opening_infill',
              metadata: { 'capability' => 'opening.infill_host' }
            )
            opening_host.attach_infill(
              opening,
              infill_id: smart_object.id,
              infill_type: "door_window.#{type.category}",
              width_mm: type.width_mm,
              height_mm: type.height_mm
            )
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(opening.entity, 'dirty_drawing')

            {
              created_object_ids: [smart_object.id],
              updated_object_ids: [opening.id],
              events: [
                { name: 'ObjectCreated', object_ids: [smart_object.id], payload: { type: 'door_window.instance' } },
                { name: 'DoorWindowAttached', object_ids: [smart_object.id, opening.id], payload: { type_id: type.id } },
                { name: 'RelationshipChanged', object_ids: [smart_object.id, opening.id], payload: { kind: 'host' } },
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id, opening.id] },
                { name: 'ScheduleDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          runtime.commands.register(
            'PlaceDoorWindowOnWall',
            owner_module: 'constructflow.door_window',
            validator: lambda { |command|
              place_on_wall_validation_errors(command[:input], runtime, wall_host)
            }
          ) do |command|
            input = command[:input]
            host = runtime.smart_objects.fetch_by_id(input[:host_object_id] || input['host_object_id'])
            placement = wall_host.locate(host, input[:point_mm] || input['point_mm'])
            width_mm = Float(input[:width_mm] || input['width_mm'])
            height_mm = Float(input[:height_mm] || input['height_mm'])
            sill_mm = Float(input[:sill_mm] || input['sill_mm'] || 0)
            opening_result = runtime.commands.execute(
              'CreateOpening',
              input.merge(
                host_object_id: host.id,
                segment_index: placement[:segment_index],
                start_offset_mm: placement[:distance_along_mm] - (width_mm / 2.0),
                width_mm: width_mm,
                height_mm: height_mm,
                sill_mm: sill_mm
              ),
              project_id: runtime.project.project_id
            )
            raise ArgumentError, Array(opening_result[:errors]).join('; ') unless opening_result[:status] == 'success'

            opening_id = Array(opening_result[:created_object_ids]).first
            infill_result = runtime.commands.execute(
              'CreateDoorWindow',
              input.merge(opening_object_id: opening_id),
              project_id: runtime.project.project_id
            )
            raise ArgumentError, Array(infill_result[:errors]).join('; ') unless infill_result[:status] == 'success'

            {
              created_object_ids: (Array(opening_result[:created_object_ids]) + Array(infill_result[:created_object_ids])).uniq,
              updated_object_ids: (Array(opening_result[:updated_object_ids]) + Array(infill_result[:updated_object_ids])).uniq,
              removed_object_ids: [],
              warnings: (Array(opening_result[:warnings]) + Array(infill_result[:warnings])).uniq,
              # CreateOpening and CreateDoorWindow already publish their events
              # inside the shared nested transaction. Do not return those event
              # specs to the outer CommandBus or the topology/history would be
              # published a second time under the composite command id.
              events: []
            }
          end

          runtime.commands.register(
            'ModifyDoorWindowInstance',
            owner_module: 'constructflow.door_window',
            validator: ->(command) { modify_instance_validation_errors(command[:input], runtime, repository) }
          ) do |command|
            input = command[:input]
            smart_object = resolve_instance(input, runtime)
            current = repository.read(smart_object.entity)
            updated = current.with(
              handing: value_or(input, :handing, current.handing),
              schedule_mark: value_or(input, :schedule_mark, current.schedule_mark),
              parameters: value_or(input, :parameters, current.parameters)
            )
            type = TypeRegistry.new(runtime.active_model).fetch(current.type_id)
            opening = runtime.smart_objects.fetch_by_id(current.opening_object_id)
            raise ArgumentError, 'door/window opening host missing' unless opening && opening_host.compatible_host?(opening)
            type.parametric_parameters(instance_parameters: updated.parameters)
            geometry.rebuild!(
              smart_object.entity,
              opening_object: opening,
              type: type,
              opening_host_capability: opening_host,
              instance_parameters: updated.parameters
            )
            repository.write(smart_object.entity, updated)
            runtime.smart_objects.mark_dirty(smart_object.entity, 'dirty_drawing', 'dirty_quantity')
            {
              updated_object_ids: [smart_object.id],
              events: [
                { name: 'DoorWindowInstanceChanged', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'ScheduleDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          runtime.commands.register(
            'EditDoorWindowSchedule',
            owner_module: 'constructflow.door_window',
            validator: ->(command) { schedule_edit_validation_errors(command[:input], runtime) }
          ) do |command|
            input = command[:input]
            object = resolve_instance(input, runtime)
            editor = schedule_editor(runtime)
            row = editor.rows([object]).first
            updated_row = editor.edit(
              row: row,
              field_id: input[:field_id] || input['field_id'],
              value: input[:value] || input['value']
            )
            {
              updated_object_ids: [object.id],
              events: [
                { name: 'ScheduleDirty', object_ids: [object.id], payload: { schedule_id: DOOR_WINDOW_SCHEDULE.id } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] }
              ],
              revision_meta: { schedule_row: updated_row }
            }
          end

          runtime.commands.register(
            'SwapDoorWindowType',
            owner_module: 'constructflow.door_window',
            validator: lambda { |command|
              swap_validation_errors(command[:input], runtime, repository, opening_host, validator)
            }
          ) do |command|
            input = command[:input]
            smart_object = resolve_instance(input, runtime)
            current = repository.read(smart_object.entity)
            opening = runtime.smart_objects.fetch_by_id(current.opening_object_id)
            target = TypeRegistry.new(runtime.active_model).fetch(input[:type_id] || input['type_id'])
            updated = current.with(type_id: target.id)

            geometry.rebuild!(
              smart_object.entity,
              opening_object: opening,
              type: target,
              opening_host_capability: opening_host,
              instance_parameters: current.parameters
            )
            repository.write(smart_object.entity, updated)
            opening_host.attach_infill(
              opening,
              infill_id: smart_object.id,
              infill_type: "door_window.#{target.category}",
              width_mm: target.width_mm,
              height_mm: target.height_mm
            )
            runtime.smart_objects.mark_dirty(smart_object.entity, 'dirty_quantity', 'dirty_drawing')

            {
              updated_object_ids: [smart_object.id, opening.id],
              events: [
                { name: 'DoorWindowInstanceChanged', object_ids: [smart_object.id], payload: { type_id: target.id } },
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id, opening.id] },
                { name: 'ScheduleDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          runtime.commands.register(
            'ChangePanelConfiguration',
            owner_module: 'constructflow.door_window',
            validator: ->(command) { type_change_validation_errors(command[:input], runtime, :panels) }
          ) do |command|
            input = command[:input]
            registry = TypeRegistry.new(runtime.active_model)
            type_id = input[:type_id] || input['type_id']
            updated_type = registry.update(type_id) do |current|
              current.with(
                operation: value_or(input, :operation, current.operation),
                panel_roles: value_or(input, :panel_roles, current.panel_roles),
                panel_style: value_or(input, :panel_style, current.panel_style)
              )
            end
            affected = rebuild_type_instances(runtime, repository, geometry, opening_host, updated_type)
            type_change_result(updated_type, affected)
          end

          runtime.commands.register(
            'ChangeFrameSystem',
            owner_module: 'constructflow.door_window',
            validator: ->(command) { type_change_validation_errors(command[:input], runtime, :frame) }
          ) do |command|
            input = command[:input]
            registry = TypeRegistry.new(runtime.active_model)
            type_id = input[:type_id] || input['type_id']
            updated_type = registry.update(type_id) do |current|
              current.with(
                frame_material: value_or(input, :frame_material, current.frame_material),
                frame_width_mm: value_or(input, :frame_width_mm, current.frame_width_mm)
              )
            end
            affected = rebuild_type_instances(runtime, repository, geometry, opening_host, updated_type)
            type_change_result(updated_type, affected)
          end

          runtime.commands.register(
            'MakeUniqueType',
            owner_module: 'constructflow.door_window',
            validator: ->(command) { make_unique_validation_errors(command[:input], runtime, repository) }
          ) do |command|
            input = command[:input]
            smart_object = resolve_instance(input, runtime)
            instance = repository.read(smart_object.entity)
            registry = TypeRegistry.new(runtime.active_model)
            source_type = registry.fetch(instance.type_id)
            new_id = (input[:new_type_id] || input['new_type_id']).to_s
            unique_type = DoorWindowType.new(
              **symbolize_type(source_type.to_h).merge(id: new_id, name: input[:name] || input['name'] || "#{source_type.name} Unique")
            )
            registry.register(unique_type)
            updated_instance = instance.with(type_id: unique_type.id)
            opening = runtime.smart_objects.fetch_by_id(instance.opening_object_id)
            geometry.rebuild!(
              smart_object.entity,
              opening_object: opening,
              type: unique_type,
              opening_host_capability: opening_host,
              instance_parameters: instance.parameters
            )
            repository.write(smart_object.entity, updated_instance)
            opening_host.attach_infill(
              opening,
              infill_id: smart_object.id,
              infill_type: "door_window.#{unique_type.category}",
              width_mm: unique_type.width_mm,
              height_mm: unique_type.height_mm
            )
            runtime.smart_objects.mark_dirty(smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(opening.entity, 'dirty_drawing')

            {
              updated_object_ids: [smart_object.id, opening.id],
              events: [
                { name: 'DoorWindowInstanceChanged', object_ids: [smart_object.id], payload: { type_id: unique_type.id } },
                { name: 'GeometryChanged', object_ids: [smart_object.id, opening.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id, opening.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id, opening.id] },
                { name: 'ScheduleDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          if runtime.respond_to?(:events)
            runtime.events.subscribe('GeometryChanged', owner: MANIFEST[:id]) do |event|
              next unless event[:source_module].to_s == 'constructflow.opening'

              with_reconciliation_transaction(runtime, 'Reconcile door/window infill') do
                reconcile_opening_dependents(runtime, repository, geometry, opening_host, event[:object_ids])
              end
            end
          end

          install_ui(runtime, opening_host)
        end

        def schedule_edit_validation_errors(input, runtime)
          object = resolve_instance(input, runtime)
          return ['door/window instance not found'] unless object

          field_id = input[:field_id] || input['field_id']
          column = DOOR_WINDOW_SCHEDULE.column(field_id)
          return ["unknown schedule field: #{field_id}"] unless column
          return ["schedule field is read-only: #{field_id}"] unless column['editable'] && !column['calculated']

          []
        rescue StandardError => error
          [error.message]
        end

        def schedule_update_result(runtime, change)
          object_id = change.fetch(:object_id).to_s
          field_id = change.fetch(:field_id).to_s
          value = change[:value]
          command, input = case field_id
                           when 'schedule_mark', 'handing'
                             ['ModifyDoorWindowInstance', { object_id: object_id, field_id => value }]
                           when 'type_id'
                             ['SwapDoorWindowType', { object_id: object_id, type_id: value }]
                           when 'frame_material'
                             object = runtime.smart_objects.fetch_by_id(object_id)
                             instance = InstanceRepository.new.read(object.entity)
                             type = TypeRegistry.new(runtime.active_model).fetch(instance.type_id)
                             ['ChangeFrameSystem', { type_id: type.id, frame_material: value }]
                           else
                             raise ArgumentError, "unsupported schedule field: #{field_id}"
                           end
          runtime.commands.execute(command, input, project_id: runtime.project.project_id)
        end

        def create_validation_errors(input, runtime, opening_host, validator)
          opening = resolve_opening(input, runtime, opening_host)
          return ['compatible Opening host required'] unless opening

          level_error = opening_host_level_error(input, opening, runtime)
          return [level_error] if level_error

          registry = TypeRegistry.new(runtime.active_model)
          type = preview_type(input, registry, opening_host.dimensions(opening))
            instance = InstanceDefinition.new(
              type_id: type.id,
              opening_object_id: opening.id,
              handing: input[:handing] || input['handing'] || 'default',
              schedule_mark: input[:schedule_mark] || input['schedule_mark'],
              parameters: input[:parameters] || input['parameters'] || {}
          )
          validator.validate(
            instance_definition: instance,
            type: type,
            opening_object: opening
          ).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def opening_host_level_error(input, opening, runtime)
          requested_level_id = input[:level_id] || input['level_id']
          return unless requested_level_id && !requested_level_id.to_s.strip.empty?

          definition = Opening::OpeningRepository.new.read(opening.entity)
          host = definition && runtime.smart_objects.fetch_by_id(definition.host_object_id)
          return 'compatible Opening host required' unless host

          wall_definition = Architecture::WallRepository.new.read(host.entity)
          host_level_id = wall_definition && wall_definition.base_level_id
          host_level_id ||= Array(host.level_refs).filter_map do |reference|
            reference.is_a?(Hash) ? (reference[:level_id] || reference['level_id']) : reference
          end.first
          return if host_level_id.nil? || host_level_id.to_s.empty?
          return if host_level_id.to_s == requested_level_id.to_s.strip

          'Opening host wall is not on the requested plan level'
        rescue StandardError => error
          "unable to verify Opening host level: #{error.message}"
        end

        def place_on_wall_validation_errors(input, runtime, wall_host)
          values = input || {}
          host = runtime.smart_objects.fetch_by_id(values[:host_object_id] || values['host_object_id'])
          return ['compatible Smart Wall host is required'] unless wall_host.compatible_host?(host)

          requested_level_id = values[:level_id] || values['level_id']
          unless requested_level_id.to_s.strip.empty?
            wall_definition = Architecture::WallRepository.new.read(host.entity)
            host_level_id = wall_definition && wall_definition.base_level_id
            host_level_id ||= Array(host.level_refs).filter_map do |reference|
              reference.is_a?(Hash) ? (reference[:level_id] || reference['level_id']) : reference
            end.first
            if host_level_id && host_level_id.to_s != requested_level_id.to_s.strip
              return ['host Smart Wall is not on the requested plan level']
            end
          end

          point = values[:point_mm] || values['point_mm']
          return ['plan point is required'] unless Array(point).length >= 3

          width = Float(values[:width_mm] || values['width_mm'])
          height = Float(values[:height_mm] || values['height_mm'])
          sill = Float(values[:sill_mm] || values['sill_mm'] || 0)
          return ['door/window width must be greater than zero'] unless width.positive?
          return ['door/window height must be greater than zero'] unless height.positive?
          return ['door/window sill must be zero or greater'] if sill.negative?

          placement = wall_host.locate(host, point)
          descriptor = {
            segment_index: placement[:segment_index],
            start_offset_mm: placement[:distance_along_mm] - (width / 2.0),
            width_mm: width,
            height_mm: height,
            sill_mm: sill
          }
          wall_host.validate_opening(host, descriptor)
        rescue ArgumentError, TypeError => error
          [error.message]
        end

        def swap_validation_errors(input, runtime, repository, opening_host, validator)
          smart_object = resolve_instance(input, runtime)
          return ['door/window instance not found'] unless smart_object

          current = repository.read(smart_object.entity)
          return ['door/window instance definition missing'] unless current

          opening = runtime.smart_objects.fetch_by_id(current.opening_object_id)
          return ['opening host not found'] unless opening_host.compatible_host?(opening)

          type_id = input[:type_id] || input['type_id']
          target = TypeRegistry.new(runtime.active_model).fetch(type_id)
          updated = current.with(type_id: target.id)
          validator.validate(
            instance_definition: updated,
            type: target,
            opening_object: opening,
            infill_id: smart_object.id
          ).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def type_change_validation_errors(input, runtime, mode)
          type_id = input[:type_id] || input['type_id']
          return ['type_id required'] if type_id.to_s.strip.empty?

          registry = TypeRegistry.new(runtime.active_model)
          current = registry.fetch(type_id)
          candidate = if mode == :panels
                        current.with(
                          operation: value_or(input, :operation, current.operation),
                          panel_roles: value_or(input, :panel_roles, current.panel_roles),
                          panel_style: value_or(input, :panel_style, current.panel_style)
                        )
                      else
                        current.with(
                          frame_material: value_or(input, :frame_material, current.frame_material),
                          frame_width_mm: value_or(input, :frame_width_mm, current.frame_width_mm)
                        )
                      end
          candidate.errors
        rescue StandardError => error
          [error.message]
        end

        def modify_instance_validation_errors(input, runtime, repository)
          smart_object = resolve_instance(input, runtime)
          return ['door/window instance not found'] unless smart_object
          return ['door/window instance definition missing'] unless repository.read(smart_object.entity)

          handing = value_or(input, :handing, repository.read(smart_object.entity).handing)
          return ['handing is required'] if handing.to_s.strip.empty?

          []
        rescue StandardError => error
          [error.message]
        end

        def reconcile_opening_dependents(runtime, repository, geometry, opening_host, object_ids)
          affected = Array(object_ids).map(&:to_s)
          runtime.smart_objects.all.each do |infill|
            next unless infill.type == 'door_window.instance' && infill.owner_module == 'constructflow.door_window'

            instance = repository.read(infill.entity)
            next unless instance && affected.include?(instance.opening_object_id.to_s)

            opening = runtime.smart_objects.fetch_by_id(instance.opening_object_id)
            next unless opening

            type = TypeRegistry.new(runtime.active_model).fetch(instance.type_id)
            geometry.rebuild!(
              infill.entity,
              opening_object: opening,
              type: type,
              opening_host_capability: opening_host,
              instance_parameters: instance.parameters
            )
            runtime.smart_objects.mark_dirty(infill.entity, 'dirty_quantity', 'dirty_drawing')
          rescue StandardError => error
            runtime.diagnostics&.warn('door_window_rebuild_failed', error.message, object_id: infill.id)
          end
        end

        def with_reconciliation_transaction(runtime, label)
          commands = runtime.respond_to?(:commands) ? runtime.commands : nil
          transaction_manager = commands && commands.respond_to?(:transaction_manager) ? commands.transaction_manager : nil
          return yield unless transaction_manager

          transaction_manager.run("ConstructFlow: #{label}") { yield }
        end

        def make_unique_validation_errors(input, runtime, repository)
          smart_object = resolve_instance(input, runtime)
          return ['door/window instance not found'] unless smart_object
          return ['door/window instance definition missing'] unless repository.read(smart_object.entity)

          new_id = input[:new_type_id] || input['new_type_id']
          return ['new_type_id required'] if new_id.to_s.strip.empty?
          return ['new type id already exists'] if TypeRegistry.new(runtime.active_model).registered?(new_id)

          []
        rescue StandardError => error
          [error.message]
        end

        def resolve_opening(input, runtime, opening_host)
          entity = input[:opening_entity] || input['opening_entity']
          object = if entity
                     runtime.smart_objects.fetch(entity)
                   else
                     runtime.smart_objects.fetch_by_id(input[:opening_object_id] || input['opening_object_id'])
                   end
          opening_host.compatible_host?(object) ? object : nil
        end

        def resolve_instance(input, runtime)
          entity = input[:entity] || input['entity']
          object = if entity
                     runtime.smart_objects.fetch(entity)
                   else
                     runtime.smart_objects.fetch_by_id(input[:object_id] || input['object_id'])
                   end
          return nil unless object && object.owner_module == 'constructflow.door_window' && object.type == 'door_window.instance'

          object
        end

        def preview_type(input, registry, opening_dimensions)
          type_id = input[:type_id] || input['type_id']
          return registry.fetch(type_id) if type_id && registry.registered?(type_id)

          build_type(input, opening_dimensions, type_id: type_id)
        end

        def resolve_or_register_type(input, registry, opening_dimensions)
          type = preview_type(input, registry, opening_dimensions)
          registry.register(type) unless registry.registered?(type.id)
          type
        end

        def build_type(input, opening_dimensions, type_id: nil)
          category = (input[:category] || input['category'] || 'window').to_s
          operation = (input[:operation] || input['operation'] || 'fixed').to_s
          frame_material = (input[:frame_material] || input['frame_material'] || 'aluminium').to_s
          panel_style = (input[:panel_style] || input['panel_style'] || 'glazed').to_s
          width = Float(input[:width_mm] || input['width_mm'] || opening_dimensions[:width_mm])
          height = Float(input[:height_mm] || input['height_mm'] || opening_dimensions[:height_mm])
          id = type_id.to_s.strip
          if id.empty?
            id = [
              'generic', category, operation,
              "#{width.round}x#{height.round}", frame_material, panel_style
            ].join('.')
          end

          DoorWindowType.new(
            id: id,
            name: input[:type_name] || input['type_name'] || id,
            category: category,
            operation: operation,
            width_mm: width,
            height_mm: height,
            frame_material: frame_material,
            frame_width_mm: input[:frame_width_mm] || input['frame_width_mm'] || 50,
            panel_roles: input[:panel_roles] || input['panel_roles'],
            panel_style: panel_style
          )
        end

        def rebuild_type_instances(runtime, repository, geometry, opening_host, type)
          affected = []
          runtime.smart_objects.all.each do |object|
            next unless object.owner_module == 'constructflow.door_window' && object.type == 'door_window.instance'

            instance = repository.read(object.entity)
            next unless instance && instance.type_id == type.id

            opening = runtime.smart_objects.fetch_by_id(instance.opening_object_id)
            next unless opening_host.compatible_host?(opening)

            geometry.rebuild!(
              object.entity,
              opening_object: opening,
              type: type,
              opening_host_capability: opening_host,
              instance_parameters: instance.parameters
            )
            opening_host.attach_infill(
              opening,
              infill_id: object.id,
              infill_type: "door_window.#{type.category}",
              width_mm: type.width_mm,
              height_mm: type.height_mm
            )
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
            affected << object.id
          end
          affected.freeze
        end

        def type_change_result(type, affected)
          {
            updated_object_ids: affected,
            events: [
              { name: 'DoorWindowTypeChanged', object_ids: affected, payload: { type_id: type.id } },
              { name: 'GeometryChanged', object_ids: affected },
              { name: 'QuantityDirty', object_ids: affected },
              { name: 'DrawingDirty', object_ids: affected },
              { name: 'ScheduleDirty', object_ids: affected }
            ]
          }
        end

        def symbolize_type(hash)
          {
            id: hash['id'],
            name: hash['name'],
            category: hash['category'],
            operation: hash['operation'],
            width_mm: hash['width_mm'],
            height_mm: hash['height_mm'],
            frame_material: hash['frame_material'],
            frame_width_mm: hash['frame_width_mm'],
            panel_roles: hash['panel_roles'],
            panel_style: hash['panel_style']
          }
        end

        def value_or(input, key, default)
          return input[key] if input.key?(key)
          string_key = key.to_s
          return input[string_key] if input.key?(string_key)

          default
        end

        def install_ui(runtime, opening_host)
          menu = runtime.menu.add_submenu('Doors & Windows')
          menu.add_item('Fill Selected Opening') do
            opening = selected_opening(runtime, opening_host)
            unless opening
              UI.messagebox('Select one ConstructFlow Opening first.')
              next
            end

            values = UI.inputbox(
              ['Category (door/window)', 'Operation (fixed/sliding/swing)', 'Frame material', 'Panel style'],
              ['window', 'fixed', 'aluminium', 'glazed'],
              'ConstructFlow Door / Window'
            )
            next unless values

            result = runtime.commands.execute(
              'CreateDoorWindow',
              {
                opening_object_id: opening.id,
                category: values[0].to_s,
                operation: values[1].to_s,
                frame_material: values[2].to_s,
                panel_style: values[3].to_s
              },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
          rescue StandardError => error
            UI.messagebox(error.message)
          end
          menu.add_item('Place Door/Window in Architecture Plan') do
            values = UI.inputbox(
              ['Category (door/window)', 'Operation (fixed/sliding/swing)', 'Frame material', 'Panel style', 'Handing', 'Schedule mark', 'Width (mm)', 'Height (mm)', 'Sill (mm)', 'Base level ID (optional)'],
              ['window', 'fixed', 'aluminium', 'glazed', 'default', '', '900', '2100', '0', ''],
              'ConstructFlow Plan Door / Window'
            )
            next unless values

            runtime.active_model.select_tool(
              Tools::PlaceTool.new(
                runtime: runtime,
                category: values[0],
                operation: values[1],
                frame_material: values[2],
                panel_style: values[3],
                handing: values[4],
                schedule_mark: values[5],
                width_mm: values[6],
                height_mm: values[7],
                sill_mm: values[8],
                level_id: values[9]
              )
            )
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end
        end

        def selected_opening(runtime, opening_host)
          runtime.active_model.selection.each do |entity|
            object = runtime.smart_objects.fetch(entity)
            return object if opening_host.compatible_host?(object)
          end
          nil
        end
      end
    end
  end
end
