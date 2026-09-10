# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      module ExtensionCommandRegistration
        COMMAND = 'GenerateOrUpdateDoorWindowFromExtension'
        RELATION_KIND = 'generated_from'
        RELATION_ROLE = 'extension_source'
        OPENING_SLOT = 'attachment_opening'
        INFILL_SLOT = 'attachment_infill'

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
            validator: ->(command) { validation_errors(command[:input], runtime, opening_host, repository, validator) }
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
              instance: existing,
              extension_id: extension_id
            )
          end
          return no_op('attachment door/window infill disabled') unless truthy?(fetch(config, :enabled))

          opening = find_attachment_opening(runtime, extension_id)
          raise ArgumentError, 'generated attachment opening required before door/window infill' unless opening && opening_host.compatible_host?(opening)

          dimensions = opening_host.dimensions(opening)
          registry = TypeRegistry.new(runtime.active_model)
          type = Registration.resolve_or_register_type(config, registry, dimensions)

          if existing
            current = repository.read(existing.entity) || raise(KeyError, 'generated door/window definition missing')
            if current.opening_object_id.to_s != opening.id.to_s
              raise ArgumentError, 'generated door/window opening identity changed; reconcile and recreate explicitly'
            end
            candidate = current.with(type_id: type.id, handing: fetch(config, :handing) || current.handing,
                                     schedule_mark: fetch(config, :schedule_mark) || current.schedule_mark)
            issues = validator.validate(
              instance_definition: candidate,
              type: type,
              opening_object: opening,
              infill_id: existing.id
            )
            raise_on_errors!(issues)
            geometry.rebuild!(
              existing.entity,
              opening_object: opening,
              type: type,
              opening_host_capability: opening_host
            )
            repository.write(existing.entity, candidate)
            opening_host.attach_infill(
              opening,
              infill_id: existing.id,
              infill_type: "door_window.#{type.category}",
              width_mm: type.width_mm,
              height_mm: type.height_mm
            )
            runtime.smart_objects.mark_dirty(existing.entity, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(opening.entity, 'dirty_drawing')
            return result_for(
              created: [], updated: [existing.id, opening.id], removed: [],
              event: 'DoorWindowInstanceChanged', ids: [existing.id, opening.id],
              payload: { source: extension_id, slot: INFILL_SLOT, type_id: type.id }
            )
          end

          instance = InstanceDefinition.new(
            type_id: type.id,
            opening_object_id: opening.id,
            handing: fetch(config, :handing) || 'default',
            schedule_mark: fetch(config, :schedule_mark)
          )
          raise_on_errors!(validator.validate(instance_definition: instance, type: type, opening_object: opening))
          group = geometry.create_group(
            runtime.active_model,
            opening_object: opening,
            type: type,
            opening_host_capability: opening_host
          )
          object = runtime.smart_objects.create(
            entity: group,
            type: 'door_window.instance',
            owner_module: 'constructflow.door_window',
            display_name: fetch(config, :display_name) || type.name,
            created_phase: Core::Phase::NEW_CONSTRUCTION,
            source_state: 'confirmed'
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
            metadata: { 'slot' => INFILL_SLOT, 'domain' => 'door_window' }
          )
          opening_host.attach_infill(
            opening,
            infill_id: object.id,
            infill_type: "door_window.#{type.category}",
            width_mm: type.width_mm,
            height_mm: type.height_mm
          )
          runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
          runtime.smart_objects.mark_dirty(opening.entity, 'dirty_drawing')
          result_for(
            created: [object.id], updated: [opening.id], removed: [],
            event: 'DoorWindowAttached', ids: [object.id, opening.id],
            payload: { source: extension_id, slot: INFILL_SLOT, type_id: type.id }
          )
        end

        def reconcile_disabled(runtime:, repository:, opening_host:, instance:, extension_id:)
          return no_op('no generated attachment infill to reconcile') unless instance

          definition = repository.read(instance.entity) || raise(KeyError, 'generated door/window definition missing')
          opening = runtime.smart_objects.fetch_by_id(definition.opening_object_id)
          opening_host.detach_infill(opening, infill_id: instance.id) if opening && opening_host.compatible_host?(opening)
          runtime.smart_objects.mark_dirty(opening.entity, 'dirty_drawing') if opening
          runtime.smart_objects.erase!(instance.entity)
          result_for(
            created: [], updated: opening ? [opening.id] : [], removed: [instance.id],
            event: 'DoorWindowRemoved', ids: [instance.id, opening&.id].compact,
            payload: { source: extension_id, slot: INFILL_SLOT, reason: 'source_intent_reconciled' }
          )
        end

        def find_attachment_opening(runtime, extension_id)
          runtime.smart_objects.all.find do |object|
            next false unless object.type.to_s.start_with?('opening.') && object.owner_module.to_s == 'constructflow.opening'
            generated_slot?(object, extension_id, OPENING_SLOT)
          end
        end

        def find_generated(runtime, extension_id)
          runtime.smart_objects.all.find do |object|
            next false unless object.type.to_s == 'door_window.instance' && object.owner_module.to_s == 'constructflow.door_window'
            generated_slot?(object, extension_id, INFILL_SLOT)
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

        def validation_errors(input, runtime, opening_host, repository, validator)
          intent = fetch(input, :intent) || {}
          extension_id = (fetch(input, :extension_id) || fetch(intent, :extension_id)).to_s
          config = fetch(intent, :config) || {}
          errors = []
          errors << 'extension_id required' if extension_id.empty?
          return errors if explicit_disable?(config) || !truthy?(fetch(config, :enabled))

          opening = find_attachment_opening(runtime, extension_id)
          return errors + ['generated attachment opening required before door/window infill'] unless opening && opening_host.compatible_host?(opening)

          registry = TypeRegistry.new(runtime.active_model)
          type = Registration.preview_type(config, registry, opening_host.dimensions(opening))
          instance = find_generated(runtime, extension_id)
          candidate = if instance
                        current = repository.read(instance.entity)
                        return errors + ['generated door/window definition missing'] unless current
                        current.with(type_id: type.id)
                      else
                        InstanceDefinition.new(
                          type_id: type.id,
                          opening_object_id: opening.id,
                          handing: fetch(config, :handing) || 'default',
                          schedule_mark: fetch(config, :schedule_mark)
                        )
                      end
          errors.concat(validator.validate(
            instance_definition: candidate,
            type: type,
            opening_object: opening,
            infill_id: instance&.id
          ).map { |issue| issue[:message] || issue['message'] })
          errors
        rescue StandardError => error
          [error.message]
        end

        def result_for(created:, updated:, removed:, event:, ids:, payload:)
          touched = (created + updated + removed).compact.uniq
          {
            created_object_ids: created.compact.uniq,
            updated_object_ids: updated.compact.uniq,
            removed_object_ids: removed.compact.uniq,
            warnings: [],
            events: [
              { name: event, object_ids: ids.compact.uniq, payload: payload },
              { name: 'QuantityDirty', object_ids: (created + removed).compact.uniq },
              { name: 'DrawingDirty', object_ids: touched },
              { name: 'ScheduleDirty', object_ids: (created + updated).compact.uniq }
            ]
          }
        end

        def raise_on_errors!(issues)
          errors = Array(issues).map { |issue| issue[:message] || issue['message'] }.compact
          raise ArgumentError, errors.join('; ') unless errors.empty?
        end

        def explicit_disable?(config)
          key?(config, :enabled) && fetch(config, :enabled) == false
        end

        def truthy?(value) = value == true

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
