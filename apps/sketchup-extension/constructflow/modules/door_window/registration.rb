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
          commands: %w[CreateDoorWindow SwapDoorWindowType ChangePanelConfiguration ChangeFrameSystem MakeUniqueType],
          events: %w[DoorWindowAttached DoorWindowTypeChanged DoorWindowInstanceChanged GeometryChanged QuantityDirty DrawingDirty ScheduleDirty],
          providers: ['constructflow.door_window.quantity'],
          validators: ['door_window.opening_fit']
        }.freeze

        module_function

        def install(runtime)
          return if runtime.modules.registered?('constructflow.door_window')

          runtime.module_loader.load(MANIFEST)
          opening_host = runtime.capabilities.fetch('opening.infill_host')
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
              schedule_mark: input[:schedule_mark] || input['schedule_mark']
            )
            group = geometry.create_group(
              runtime.active_model,
              opening_object: opening,
              type: type,
              opening_host_capability: opening_host
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
              opening_host_capability: opening_host
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
            repository.write(smart_object.entity, updated_instance)
            runtime.smart_objects.mark_dirty(smart_object.entity, 'dirty_quantity', 'dirty_drawing')

            {
              updated_object_ids: [smart_object.id],
              events: [
                { name: 'DoorWindowInstanceChanged', object_ids: [smart_object.id], payload: { type_id: unique_type.id } },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] },
                { name: 'ScheduleDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          install_ui(runtime, opening_host)
        end

        def create_validation_errors(input, runtime, opening_host, validator)
          opening = resolve_opening(input, runtime, opening_host)
          return ['compatible Opening host required'] unless opening

          registry = TypeRegistry.new(runtime.active_model)
          type = preview_type(input, registry, opening_host.dimensions(opening))
          instance = InstanceDefinition.new(
            type_id: type.id,
            opening_object_id: opening.id,
            handing: input[:handing] || input['handing'] || 'default',
            schedule_mark: input[:schedule_mark] || input['schedule_mark']
          )
          validator.validate(
            instance_definition: instance,
            type: type,
            opening_object: opening
          ).map { |issue| issue[:message] }
        rescue StandardError => error
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
              opening_host_capability: opening_host
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
