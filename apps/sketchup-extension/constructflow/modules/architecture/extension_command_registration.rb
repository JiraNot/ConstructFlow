# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      module ExtensionCommandRegistration
        COMMAND = 'GenerateOrUpdateArchitectureFromExtension'
        RELATION_KIND = 'generated_from'
        RELATION_ROLE = 'extension_source'
        SLOT_PREFIX = 'wall_edge_'

        module_function

        def install(runtime)
          return if runtime.commands.registered?(COMMAND)

          repository = WallRepository.new
          geometry = WallGeometry.new
          validator = Validators::WallValidator.new
          attachment_resolver = AttachmentEdgeResolver.new(repository: repository)
          runtime.commands.register(
            COMMAND,
            owner_module: 'constructflow.architecture',
            validator: ->(command) { validation_errors(command[:input]) }
          ) do |command|
            generate_or_update(
              runtime: runtime,
              input: command[:input],
              repository: repository,
              geometry: geometry,
              validator: validator,
              attachment_resolver: attachment_resolver
            )
          end
        end

        def generate_or_update(runtime:, input:, repository:, geometry:, validator:, attachment_resolver: nil)
          intent = fetch(input, :intent) || {}
          extension_id = (fetch(input, :extension_id) || fetch(intent, :extension_id)).to_s
          raise ArgumentError, 'extension_id required' if extension_id.empty?

          config = fetch(intent, :config) || {}
          boundary = normalize_boundary(fetch(intent, :boundary_mm))
          raise ArgumentError, 'extension boundary requires at least three unique points' if boundary.length < 3

          base_level_id = fetch(intent, :base_level_id)
          base_offset_mm = Float(fetch(intent, :base_offset_mm) || 0)
          base_elevation_mm = resolve_base_elevation(runtime, base_level_id, base_offset_mm)
          height_mm = Float(fetch(config, :wall_height_mm) || fetch(intent, :target_height_mm) || WallDefinition::DEFAULT_HEIGHT_MM)
          thickness_mm = Float(fetch(config, :wall_thickness_mm) || WallDefinition::DEFAULT_THICKNESS_MM)
          wall_type_id = (fetch(config, :wall_type_id) || default_wall_type(thickness_mm)).to_s
          orientation = (fetch(config, :orientation) || 'center').to_s
          source_state = generated_source_state(config)
          current_level_refs = level_refs(base_level_id, base_offset_mm)
          attachment = resolve_attachment(
            runtime: runtime,
            repository: repository,
            resolver: attachment_resolver,
            boundary: boundary,
            intent: intent,
            config: config
          )

          created_ids = []
          updated_ids = []
          removed_ids = []
          events = []
          desired_slots = []

          if attachment
            events << {
              name: 'ExtensionAttachmentEdgeResolved',
              object_ids: [attachment.host_object_id.to_s],
              payload: attachment.to_h.merge('extension_id' => extension_id)
            }
          end

          boundary.each_with_index do |point, index|
            next if attachment && index == attachment.edge_index

            finish = boundary[(index + 1) % boundary.length]
            slot = "#{SLOT_PREFIX}#{index}"
            desired_slots << slot
            definition = WallDefinition.new(
              path_mm: [with_z(point, base_elevation_mm), with_z(finish, base_elevation_mm)],
              thickness_mm: thickness_mm,
              height_mm: height_mm,
              base_offset_mm: base_offset_mm,
              wall_type_id: wall_type_id,
              orientation: orientation
            )
            raise_on_errors!(validator.validate(definition))

            existing = find_generated(runtime, extension_id, slot)
            if existing
              openings = repository.host_openings(existing.entity)
              geometry.rebuild!(existing.entity, definition, openings: openings)
              repository.write(existing.entity, definition)
              runtime.smart_objects.update_level_refs(existing.entity, current_level_refs)
              runtime.smart_objects.mark_dirty(existing.entity, 'dirty_quantity', 'dirty_drawing')
              updated_ids << existing.id
              events << {
                name: 'GeometryChanged', object_ids: [existing.id],
                payload: { source: extension_id, slot: slot, reason: 'extension_regeneration' }
              }
              events << {
                name: 'ParametersChanged', object_ids: [existing.id],
                payload: { wall_type_id: wall_type_id, thickness_mm: thickness_mm, height_mm: height_mm }
              }
            else
              group = geometry.create_group(runtime.active_model, definition)
              object = runtime.smart_objects.create(
                entity: group,
                type: 'architecture.wall',
                owner_module: 'constructflow.architecture',
                display_name: "Extension Wall #{index + 1}",
                created_phase: Core::Phase::NEW_CONSTRUCTION,
                level_refs: current_level_refs,
                source_state: source_state
              )
              repository.write(group, definition)
              runtime.smart_objects.add_relationship(
                group,
                kind: RELATION_KIND,
                target_id: extension_id,
                role: RELATION_ROLE,
                metadata: { 'slot' => slot, 'domain' => 'architecture' }
              )
              runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
              created_ids << object.id
              events << {
                name: 'ObjectCreated', object_ids: [object.id],
                payload: { type: 'architecture.wall', source: extension_id, slot: slot }
              }
              events << { name: 'GeometryChanged', object_ids: [object.id] }
            end
          end

          stale_generated(runtime, extension_id, desired_slots).each do |object|
            slot = generated_slot(object)
            runtime.smart_objects.erase!(object.entity)
            removed_ids << object.id
            events << {
              name: 'GeometryChanged', object_ids: [object.id],
              payload: { source: extension_id, slot: slot, removed: true, reason: 'source_intent_reconciled' }
            }
          end

          touched_ids = (created_ids + updated_ids + removed_ids).uniq
          events << { name: 'QuantityDirty', object_ids: touched_ids } unless touched_ids.empty?
          events << { name: 'DrawingDirty', object_ids: touched_ids } unless touched_ids.empty?
          warnings = []
          if source_state == 'assumed'
            warnings << 'generated extension walls use assumed/default construction data; confirm wall type and thickness before final issue'
          end
          {
            created_object_ids: created_ids.uniq,
            updated_object_ids: updated_ids.uniq,
            removed_object_ids: removed_ids.uniq,
            warnings: warnings,
            events: events,
            attachment: attachment&.to_h
          }
        end

        def normalize_boundary(value)
          points = Array(value).map do |point|
            values = Array(point)
            raise ArgumentError, 'extension boundary point requires x, y, z' unless values.length >= 3
            [Float(values[0]), Float(values[1]), Float(values[2])]
          end
          points.pop if points.length > 1 && same_point?(points.first, points.last)
          points
        end

        def same_point?(a, b)
          a.zip(b).all? { |left, right| (left - right).abs <= 0.001 }
        end

        def with_z(point, z)
          [Float(point[0]), Float(point[1]), Float(z)]
        end

        def default_wall_type(thickness_mm)
          "generic.wall.#{thickness_mm.round}"
        end

        def generated_source_state(config)
          explicit_type = key?(config, :wall_type_id)
          explicit_thickness = key?(config, :wall_thickness_mm)
          explicit_type && explicit_thickness ? 'confirmed' : 'assumed'
        end

        def resolve_attachment(runtime:, repository:, resolver:, boundary:, intent:, config:)
          host_id = fetch(intent, :attachment_host_id)
          return nil if host_id.to_s.strip.empty?

          (resolver || AttachmentEdgeResolver.new(repository: repository)).resolve(
            runtime: runtime,
            boundary_mm: boundary,
            attachment_host_id: host_id,
            explicit_edge_index: fetch(config, :attachment_edge_index)
          )
        end

        def find_generated(runtime, extension_id, slot)
          generated_walls(runtime, extension_id).find { |object| generated_slot(object) == slot.to_s }
        end

        def stale_generated(runtime, extension_id, desired_slots)
          allowed = Array(desired_slots).map(&:to_s)
          generated_walls(runtime, extension_id).reject { |object| allowed.include?(generated_slot(object)) }
        end

        def generated_walls(runtime, extension_id)
          runtime.smart_objects.all.select do |object|
            next false unless object.type == 'architecture.wall' && object.owner_module == 'constructflow.architecture'

            Array(object.relationships).any? do |relationship|
              (relationship['kind'] || relationship[:kind]).to_s == RELATION_KIND &&
                (relationship['target_id'] || relationship[:target_id]).to_s == extension_id.to_s &&
                (relationship['role'] || relationship[:role]).to_s == RELATION_ROLE
            end
          end
        end

        def generated_slot(object)
          relationship = Array(object.relationships).find do |value|
            (value['kind'] || value[:kind]).to_s == RELATION_KIND &&
              (value['role'] || value[:role]).to_s == RELATION_ROLE
          end
          metadata = relationship && (relationship['metadata'] || relationship[:metadata]) || {}
          (metadata['slot'] || metadata[:slot]).to_s
        end

        def validation_errors(input)
          intent = fetch(input, :intent) || {}
          extension_id = fetch(input, :extension_id) || fetch(intent, :extension_id)
          boundary = normalize_boundary(fetch(intent, :boundary_mm))
          config = fetch(intent, :config) || {}
          errors = []
          errors << 'extension_id required' if extension_id.to_s.strip.empty?
          errors << 'extension boundary requires at least three unique points' if boundary.length < 3
          thickness = Float(fetch(config, :wall_thickness_mm) || WallDefinition::DEFAULT_THICKNESS_MM)
          height = Float(fetch(config, :wall_height_mm) || fetch(intent, :target_height_mm) || WallDefinition::DEFAULT_HEIGHT_MM)
          errors << 'wall thickness must be greater than zero' unless thickness.positive?
          errors << 'wall height must be greater than zero' unless height.positive?
          unless fetch(config, :attachment_edge_index).nil?
            index = Integer(fetch(config, :attachment_edge_index))
            errors << 'attachment_edge_index is outside extension boundary' unless index.between?(0, boundary.length - 1)
          end
          errors
        rescue StandardError => error
          [error.message]
        end

        def resolve_base_elevation(runtime, level_id, offset_mm)
          return Float(offset_mm) if level_id.nil? || level_id.to_s.empty?

          level = runtime.levels.fetch(level_id)
          raise ArgumentError, "level #{level_id} has unknown elevation" if level.elevation_mm.nil?
          Float(level.elevation_mm) + Float(offset_mm)
        end

        def level_refs(level_id, offset_mm)
          return [] if level_id.nil? || level_id.to_s.empty?
          [{ role: 'base', level_id: level_id.to_s, offset_mm: Float(offset_mm) }]
        end

        def raise_on_errors!(issues)
          errors = Array(issues).select { |issue| (issue[:severity] || issue['severity']).to_s == 'error' }
          raise ArgumentError, errors.map { |issue| issue[:message] || issue['message'] }.join('; ') unless errors.empty?
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
