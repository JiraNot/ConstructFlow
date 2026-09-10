# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Opening
      module ExtensionCommandRegistration
        COMMAND = 'GenerateOrUpdateOpeningFromExtension'
        RELATION_KIND = 'generated_from'
        RELATION_ROLE = 'extension_source'
        SLOT = 'attachment_opening'

        module_function

        def install(runtime)
          return if runtime.commands.registered?(COMMAND)

          repository = OpeningRepository.new
          geometry = OpeningGeometry.new
          host_capability = runtime.capabilities.fetch('wall.host_surface')
          validator = Validators::OpeningValidator.new(host_capability: host_capability)
          resolver = Architecture::AttachmentEdgeResolver.new

          runtime.commands.register(
            COMMAND,
            owner_module: 'constructflow.opening',
            validator: ->(command) { validation_errors(command[:input], runtime, resolver) }
          ) do |command|
            generate_or_update(
              runtime: runtime,
              input: command[:input],
              repository: repository,
              geometry: geometry,
              host_capability: host_capability,
              validator: validator,
              resolver: resolver
            )
          end
        end

        def generate_or_update(runtime:, input:, repository:, geometry:, host_capability:, validator:, resolver:)
          intent = fetch(input, :intent) || {}
          extension_id = (fetch(input, :extension_id) || fetch(intent, :extension_id)).to_s
          raise ArgumentError, 'extension_id required' if extension_id.empty?

          config = fetch(intent, :config) || {}
          existing = find_generated(runtime, extension_id)
          if explicit_disable?(config)
            return reconcile_disabled(
              runtime: runtime,
              repository: repository,
              host_capability: host_capability,
              opening: existing,
              extension_id: extension_id
            )
          end

          return no_op('attachment opening disabled') unless truthy?(fetch(config, :enabled))
          unless truthy?(fetch(config, :confirm_modify_existing_host))
            raise ArgumentError, 'opening.confirm_modify_existing_host: true is required before modifying an attachment host wall'
          end

          width_mm = explicit_positive_number!(config, :width_mm)
          height_mm = explicit_positive_number!(config, :height_mm)
          sill_mm = Float(fetch(config, :sill_mm) || 0)
          raise ArgumentError, 'opening sill_mm must be zero or greater' if sill_mm.negative?

          host_id = fetch(intent, :attachment_host_id).to_s
          raise ArgumentError, 'attachment_host_id required for attachment opening' if host_id.empty?

          attachment = resolver.resolve(
            runtime: runtime,
            boundary_mm: fetch(intent, :boundary_mm),
            attachment_host_id: host_id,
            explicit_edge_index: fetch(config, :attachment_edge_index),
            source_extension_id: extension_id
          )
          host = runtime.smart_objects.fetch_by_id(attachment.host_object_id)
          raise ArgumentError, 'attachment host not found' unless host && host_capability.compatible_host?(host)

          placement = opening_definition(
            runtime: runtime,
            intent: intent,
            config: config,
            host: host,
            host_capability: host_capability,
            attachment: attachment,
            width_mm: width_mm,
            height_mm: height_mm,
            sill_mm: sill_mm
          )
          issues = validator.validate(placement, host_object: host)
          errors = issues.select { |issue| (issue[:severity] || issue['severity']).to_s == 'error' }
          raise ArgumentError, errors.map { |issue| issue[:message] || issue['message'] }.join('; ') unless errors.empty?

          if existing
            current = repository.read(existing.entity) || raise(KeyError, 'generated attachment opening definition missing')
            if current.host_object_id.to_s != host.id.to_s
              unless truthy?(fetch(config, :rehost))
                raise ArgumentError, 'attachment host changed; opening.rehost: true is required to move the generated opening'
              end
              old_host = runtime.smart_objects.fetch_by_id(current.host_object_id)
              host_capability.detach_opening(old_host, opening_id: existing.id) if old_host && host_capability.compatible_host?(old_host)
              replace_host_relationship(runtime, existing.entity, old_host&.id, host.id)
              host_capability.attach_opening(host, opening_id: existing.id, descriptor: placement.host_descriptor(opening_id: existing.id))
            else
              host_capability.update_opening(host, opening_id: existing.id, descriptor: placement.host_descriptor(opening_id: existing.id))
            end
            geometry.rebuild!(existing.entity, host_object: host, definition: placement, host_capability: host_capability)
            repository.write(existing.entity, placement)
            runtime.smart_objects.mark_dirty(existing.entity, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(host.entity, 'dirty_quantity', 'dirty_drawing')
            return {
              created_object_ids: [],
              updated_object_ids: [existing.id, host.id].uniq,
              removed_object_ids: [],
              warnings: [],
              events: [
                { name: 'OpeningModified', object_ids: [existing.id, host.id], payload: { source: extension_id, slot: SLOT } },
                { name: 'QuantityDirty', object_ids: [existing.id, host.id] },
                { name: 'DrawingDirty', object_ids: [existing.id, host.id] }
              ]
            }
          end

          group = geometry.create_group(
            runtime.active_model,
            host_object: host,
            definition: placement,
            host_capability: host_capability
          )
          opening = runtime.smart_objects.create(
            entity: group,
            type: 'opening.rectangular',
            owner_module: 'constructflow.opening',
            display_name: 'Extension Attachment Opening',
            created_phase: Core::Phase::NEW_CONSTRUCTION,
            source_state: 'confirmed'
          )
          repository.write(group, placement)
          runtime.smart_objects.add_relationship(
            group,
            kind: 'host',
            target_id: host.id,
            role: host.created_phase == Core::Phase::EXISTING ? 'modifies_existing_host' : 'primary_host',
            metadata: { 'capability' => 'wall.host_surface' }
          )
          runtime.smart_objects.add_relationship(
            group,
            kind: RELATION_KIND,
            target_id: extension_id,
            role: RELATION_ROLE,
            metadata: { 'slot' => SLOT, 'domain' => 'opening' }
          )
          host_capability.attach_opening(host, opening_id: opening.id, descriptor: placement.host_descriptor(opening_id: opening.id))
          runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
          runtime.smart_objects.mark_dirty(host.entity, 'dirty_quantity', 'dirty_drawing')
          {
            created_object_ids: [opening.id],
            updated_object_ids: [host.id],
            removed_object_ids: [],
            warnings: [],
            events: [
              { name: 'OpeningCreated', object_ids: [opening.id, host.id], payload: { source: extension_id, slot: SLOT } },
              { name: 'QuantityDirty', object_ids: [opening.id, host.id] },
              { name: 'DrawingDirty', object_ids: [opening.id, host.id] }
            ]
          }
        end

        def opening_definition(runtime:, intent:, config:, host:, host_capability:, attachment:, width_mm:, height_mm:, sill_mm:)
          edge = boundary_edges(fetch(intent, :boundary_mm)).fetch(attachment.edge_index)
          midpoint = [
            (Float(edge[0][0]) + Float(edge[1][0])) / 2.0,
            (Float(edge[0][1]) + Float(edge[1][1])) / 2.0,
            (Float(edge[0][2]) + Float(edge[1][2])) / 2.0
          ]
          located = host_capability.locate(host, midpoint)
          start_offset = if key?(config, :host_start_offset_mm)
                           Float(fetch(config, :host_start_offset_mm))
                         else
                           Float(located[:distance_along_mm]) - (width_mm / 2.0)
                         end
          OpeningDefinition.new(
            host_object_id: host.id,
            segment_index: Integer(located[:segment_index]),
            start_offset_mm: start_offset,
            width_mm: width_mm,
            height_mm: height_mm,
            sill_mm: sill_mm
          )
        end

        def reconcile_disabled(runtime:, repository:, host_capability:, opening:, extension_id:)
          return no_op('no generated attachment opening to reconcile') unless opening

          definition = repository.read(opening.entity)
          host = definition && runtime.smart_objects.fetch_by_id(definition.host_object_id)
          host_capability.detach_opening(host, opening_id: opening.id) if host && host_capability.compatible_host?(host)
          runtime.smart_objects.mark_dirty(host.entity, 'dirty_quantity', 'dirty_drawing') if host
          runtime.smart_objects.erase!(opening.entity)
          {
            created_object_ids: [],
            updated_object_ids: host ? [host.id] : [],
            removed_object_ids: [opening.id],
            warnings: [],
            events: [
              { name: 'OpeningRemoved', object_ids: [opening.id, host&.id].compact, payload: { source: extension_id, slot: SLOT, reason: 'source_intent_reconciled' } },
              { name: 'QuantityDirty', object_ids: [opening.id, host&.id].compact },
              { name: 'DrawingDirty', object_ids: [opening.id, host&.id].compact }
            ]
          }
        end

        def replace_host_relationship(runtime, entity, old_host_id, new_host_id)
          runtime.smart_objects.remove_relationship(entity, kind: 'host', target_id: old_host_id) if old_host_id
          runtime.smart_objects.add_relationship(
            entity,
            kind: 'host',
            target_id: new_host_id,
            role: 'modifies_existing_host',
            metadata: { 'capability' => 'wall.host_surface' }
          )
        end

        def find_generated(runtime, extension_id)
          runtime.smart_objects.all.find do |object|
            next false unless object.type.to_s == 'opening.rectangular' && object.owner_module.to_s == 'constructflow.opening'
            Array(object.relationships).any? do |relationship|
              (relationship['kind'] || relationship[:kind]).to_s == RELATION_KIND &&
                (relationship['target_id'] || relationship[:target_id]).to_s == extension_id.to_s &&
                (relationship['role'] || relationship[:role]).to_s == RELATION_ROLE &&
                (((relationship['metadata'] || relationship[:metadata]) || {})['slot'] || ((relationship['metadata'] || relationship[:metadata]) || {})[:slot]).to_s == SLOT
            end
          end
        end

        def validation_errors(input, runtime, resolver)
          intent = fetch(input, :intent) || {}
          extension_id = (fetch(input, :extension_id) || fetch(intent, :extension_id)).to_s
          config = fetch(intent, :config) || {}
          errors = []
          errors << 'extension_id required' if extension_id.empty?
          return errors if explicit_disable?(config) || !truthy?(fetch(config, :enabled))
          errors << 'opening.confirm_modify_existing_host: true is required before modifying an attachment host wall' unless truthy?(fetch(config, :confirm_modify_existing_host))
          explicit_positive_number!(config, :width_mm)
          explicit_positive_number!(config, :height_mm)
          host_id = fetch(intent, :attachment_host_id).to_s
          errors << 'attachment_host_id required for attachment opening' if host_id.empty?
          resolver.resolve(
            runtime: runtime,
            boundary_mm: fetch(intent, :boundary_mm),
            attachment_host_id: host_id,
            explicit_edge_index: fetch(config, :attachment_edge_index),
            source_extension_id: extension_id
          ) unless host_id.empty?
          errors
        rescue StandardError => error
          [error.message]
        end

        def explicit_positive_number!(config, key)
          raise ArgumentError, "opening.#{key} is required" unless key?(config, key)
          value = Float(fetch(config, key))
          raise ArgumentError, "opening.#{key} must be greater than zero" unless value.positive?
          value
        end

        def explicit_disable?(config)
          key?(config, :enabled) && fetch(config, :enabled) == false
        end

        def truthy?(value)
          value == true
        end

        def boundary_edges(boundary)
          points = Array(boundary)
          points = points[0...-1] if points.length > 1 && points.first == points.last
          points.each_with_index.map { |point, index| [point, points[(index + 1) % points.length]] }
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
