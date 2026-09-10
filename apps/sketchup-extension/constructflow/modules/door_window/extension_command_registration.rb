# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      module ExtensionCommandRegistration
        COMMAND = 'GenerateOrUpdateDoorWindowFromExtension'
        RELATION_KIND = 'generated_from'
        RELATION_ROLE = 'extension_source'
        SLOT = 'attachment_infill'
        OPENING_SLOT = 'attachment_opening'

        module_function

        def install(runtime)
          return if runtime.commands.registered?(COMMAND)

          opening_host = runtime.capabilities.fetch('opening.infill_host')
          repository = InstanceRepository.new
          geometry = DoorWindowGeometry.new
          validator = Validators::DoorWindowValidator.new(opening_host_capability: opening_host)

          runtime.commands.register(
            COMMAND,
            owner_module: 'constructflow.door_window',
            validator: ->(command) { validation_errors(command[:input], runtime, opening_host, validator) }
          ) do |command|
            generate_or_update(
              runtime: runtime,
              input: command[:input],
              repository: repository,
              geometry: geometry,
              opening_host: opening_host,
              validator: validator
            )
          end
        end

        def generate_or_update(runtime:, input:, repository:, geometry:, opening_host:, validator:)
          intent = fetch(input, :intent) || {}
          extension_id = (fetch(input, :extension_id) || fetch(intent, :extension_id)).to_s
          raise ArgumentError, 'extension_id required' if extension_id.empty?

          config = fetch(intent, :config) || {}
          existing = find_generated(runtime, extension_id)
          if explicit_disable?(config)
            return reconcile_disabled(
              runtime: runtime,
              repository: repository,
              opening_host: opening_host,
              infill: existing,
              extension_id: extension_id
            )
          end
          return no_op('attachment door/window infill disabled') unless truthy?(fetch(config, :enabled))

          opening = find_attachment_opening(runtime, extension_id)
          raise ArgumentError, 'generated extension attachment opening required before door/window infill' unless opening && opening_host.compatible_host?(opening)

          registry = TypeRegistry.new(runtime.active_model)
          type, source_state = resolve_type(config, registry, opening_host.dimensions(opening))
          instance = InstanceDefinition.new(
            type_id: type.id,
            opening_object_id: opening.id,
            handing: fetch(config, :handing) || 'default',
            schedule_mark: fetch(config, :schedule_mark)
          )
          issues = validator.validate(
            instance_definition: instance,
            type: type,
            opening_object: opening,
            infill_id: existing&.id
          )
          errors = issues.select { |issue| (issue[:severity] || issue['severity']).to_s == 'error' }
          raise ArgumentError, errors.map { |issue| issue[:message] || issue['message'] }.join('; ') unless errors.empty?

          if existing
            current = repository.read(existing.entity) || raise(KeyError, 'generated extension door/window instance definition missing')
            if current.opening_object_id.to_s != opening.id.to_s
              unless truthy?(fetch(config, :rehost))
                raise ArgumentError, 'attachment opening changed; door_window.rehost: true is required to move the generated infill'
              end
              old_opening = runtime.smart_objects.fetch_by_id(current.opening_object_id)
              opening_host.detach_infill(old_opening, infill_id: existing.id) if old_opening && opening_host.compatible_host?(old_opening)
              replace_host_relationship(runtime, existing.entity, old_opening&.id, opening.id)
            end

            geometry.rebuild!(
              existing.entity,
              opening_object: opening,
              type: type,
              opening_host_capability: opening_host
            )
            repository.write(existing.entity, instance)
            opening_host.attach_infill(
              opening,
              infill_id: existing.id,
              infill_type: "door_window.#{type.category}",
              width_mm: type.width_mm,
              height_mm: type.height_mm
            )
            runtime.smart_objects.mark_dirty(existing.entity, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(opening.entity, 'dirty_drawing')
            return {
              created_object_ids: [],
              updated_object_ids: [existing.id, opening.id].uniq,
              removed_object_ids: [],
              warnings: source_state == 'assumed' ? [assumption_warning(type)] : [],
              events: [
                { name: 'DoorWindowInstanceChanged', object_ids: [existing.id, opening.id], payload: { source: extension_id, slot: SLOT, type_id: type.id } },
                { name: 'QuantityDirty', object_ids: [existing.id] },
                { name: 'DrawingDirty', object_ids: [existing.id, opening.id] },
                { name: 'ScheduleDirty', object_ids: [existing.id] }
              ]
            }
          end

          group = geometry.create_group(
            runtime.active_model,
            opening_object: opening,
            type: type,
            opening_host_capability: opening_host
          )
          infill = runtime.smart_objects.create(
            entity: group,
            type: 'door_window.instance',
            owner_module: 'constructflow.door_window',
            display_name: fetch(config, :display_name) || type.name,
            created_phase: Core::Phase::NEW_CONSTRUCTION,
            source_state: source_state
          )
          repository.write(group, instance)
          runtime.smart_objects.add_relationship(
            group,
            kind: 'host',
            target_id: opening.id,
            role: 'opening_infill',
            metadata: { 'capability' => 'opening.infill_host' }
          )
          runtime.smart_objects.add_relationship(
            group,
            kind: RELATION_KIND,
            target_id: extension_id,
            role: RELATION_ROLE,
            metadata: { 'slot' => SLOT, 'domain' => 'door_window' }
          )
          opening_host.attach_infill(
            opening,
            infill_id: infill.id,
            infill_type: "door_window.#{type.category}",
            width_mm: type.width_mm,
            height_mm: type.height_mm
          )
          runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
          runtime.smart_objects.mark_dirty(opening.entity, 'dirty_drawing')
          {
            created_object_ids: [infill.id],
            updated_object_ids: [opening.id],
            removed_object_ids: [],
            warnings: source_state == 'assumed' ? [assumption_warning(type)] : [],
            events: [
              { name: 'DoorWindowAttached', object_ids: [infill.id, opening.id], payload: { source: extension_id, slot: SLOT, type_id: type.id } },
              { name: 'QuantityDirty', object_ids: [infill.id] },
              { name: 'DrawingDirty', object_ids: [infill.id, opening.id] },
              { name: 'ScheduleDirty', object_ids: [infill.id] }
            ]
          }
        end

        def resolve_type(config, registry, opening_dimensions)
          type_id = fetch(config, :type_id).to_s.strip
          return [registry.fetch(type_id), 'confirmed'] unless type_id.empty? || !registry.registered?(type_id)

          if !type_id.empty? && !registry.registered?(type_id) && !key?(config, :category)
            raise ArgumentError, "door/window type not found: #{type_id}"
          end

          category = required_string!(config, :category)
          operation = required_string!(config, :operation)
          width_mm = Float(opening_dimensions.fetch(:width_mm))
          height_mm = Float(opening_dimensions.fetch(:height_mm))
          frame_explicit = key?(config, :frame_material)
          panel_explicit = key?(config, :panel_style)
          frame_material = (fetch(config, :frame_material) || 'generic').to_s
          panel_style = (fetch(config, :panel_style) || (category == 'door' ? 'solid' : 'glazed')).to_s
          id = type_id.empty? ? deterministic_type_id(category, operation, width_mm, height_mm, frame_material, panel_style) : type_id
          type = DoorWindowType.new(
            id: id,
            name: fetch(config, :type_name) || id,
            category: category,
            operation: operation,
            width_mm: width_mm,
            height_mm: height_mm,
            frame_material: frame_material,
            frame_width_mm: fetch(config, :frame_width_mm) || 50,
            panel_roles: fetch(config, :panel_roles),
            panel_style: panel_style
          )
          raise ArgumentError, type.errors.join('; ') unless type.valid?

          registry.register(type) unless registry.registered?(type.id)
          [type, frame_explicit && panel_explicit ? 'confirmed' : 'assumed']
        end

        def deterministic_type_id(category, operation, width_mm, height_mm, frame_material, panel_style)
          ['extension', category, operation, "#{width_mm.round}x#{height_mm.round}", frame_material, panel_style].join('.')
        end

        def reconcile_disabled(runtime:, repository:, opening_host:, infill:, extension_id:)
          return no_op('no generated attachment door/window infill to reconcile') unless infill

          definition = repository.read(infill.entity)
          opening = definition && runtime.smart_objects.fetch_by_id(definition.opening_object_id)
          opening_host.detach_infill(opening, infill_id: infill.id) if opening && opening_host.compatible_host?(opening)
          runtime.smart_objects.mark_dirty(opening.entity, 'dirty_drawing') if opening
          runtime.smart_objects.erase!(infill.entity)
          {
            created_object_ids: [],
            updated_object_ids: opening ? [opening.id] : [],
            removed_object_ids: [infill.id],
            warnings: [],
            events: [
              { name: 'DoorWindowRemoved', object_ids: [infill.id, opening&.id].compact, payload: { source: extension_id, slot: SLOT, reason: 'source_intent_reconciled' } },
              { name: 'QuantityDirty', object_ids: [infill.id] },
              { name: 'DrawingDirty', object_ids: [infill.id, opening&.id].compact },
              { name: 'ScheduleDirty', object_ids: [infill.id] }
            ]
          }
        end

        def find_attachment_opening(runtime, extension_id)
          runtime.smart_objects.all.find do |object|
            next false unless object.owner_module.to_s == 'constructflow.opening' && object.type.to_s.start_with?('opening.')
            generated_slot?(object, extension_id, OPENING_SLOT)
          end
        end

        def find_generated(runtime, extension_id)
          runtime.smart_objects.all.find do |object|
            next false unless object.owner_module.to_s == 'constructflow.door_window' && object.type.to_s == 'door_window.instance'
            generated_slot?(object, extension_id, SLOT)
          end
        end

        def generated_slot?(object, extension_id, slot)
          Array(object.relationships).any? do |relationship|
            metadata = (relationship['metadata'] || relationship[:metadata]) || {}
            (relationship['kind'] || relationship[:kind]).to_s == RELATION_KIND &&
              (relationship['target_id'] || relationship[:target_id]).to_s == extension_id.to_s &&
              (relationship['role'] || relationship[:role]).to_s == RELATION_ROLE &&
              (metadata['slot'] || metadata[:slot]).to_s == slot.to_s
          end
        end

        def replace_host_relationship(runtime, entity, old_opening_id, new_opening_id)
          runtime.smart_objects.remove_relationship(entity, kind: 'host', target_id: old_opening_id) if old_opening_id
          runtime.smart_objects.add_relationship(
            entity,
            kind: 'host',
            target_id: new_opening_id,
            role: 'opening_infill',
            metadata: { 'capability' => 'opening.infill_host' }
          )
        end

        def validation_errors(input, runtime, opening_host, validator)
          intent = fetch(input, :intent) || {}
          extension_id = (fetch(input, :extension_id) || fetch(intent, :extension_id)).to_s
          config = fetch(intent, :config) || {}
          errors = []
          errors << 'extension_id required' if extension_id.empty?
          return errors if explicit_disable?(config) || !truthy?(fetch(config, :enabled))

          opening = find_attachment_opening(runtime, extension_id)
          return errors + ['generated extension attachment opening required before door/window infill'] unless opening && opening_host.compatible_host?(opening)

          registry = TypeRegistry.new(runtime.active_model)
          type, = resolve_type(config, registry, opening_host.dimensions(opening))
          existing = find_generated(runtime, extension_id)
          instance = InstanceDefinition.new(
            type_id: type.id,
            opening_object_id: opening.id,
            handing: fetch(config, :handing) || 'default',
            schedule_mark: fetch(config, :schedule_mark)
          )
          errors.concat(
            validator.validate(
              instance_definition: instance,
              type: type,
              opening_object: opening,
              infill_id: existing&.id
            ).map { |issue| issue[:message] || issue['message'] }
          )
          errors
        rescue StandardError => error
          [error.message]
        end

        def assumption_warning(type)
          "generated attachment #{type.category} uses assumed frame/panel construction data; confirm a registered type or explicit frame material and panel style before final issue"
        end

        def explicit_disable?(config)
          key?(config, :enabled) && fetch(config, :enabled) == false
        end

        def truthy?(value)
          value == true
        end

        def required_string!(hash, key)
          value = fetch(hash, key).to_s.strip
          raise ArgumentError, "door_window.#{key} is required" if value.empty?
          value
        end

        def no_op(message)
          { created_object_ids: [], updated_object_ids: [], removed_object_ids: [], warnings: [message], events: [] }
        end

        def key?(hash, key)
          hash.respond_to?(:key?) && (hash.key?(key) || hash.key?(key.to_s))
        end

        def fetch(hash, key)
          hash[key] || hash[key.to_s]
        end
      end
    end
  end
end
