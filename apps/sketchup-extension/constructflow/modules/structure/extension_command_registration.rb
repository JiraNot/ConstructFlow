# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      module ExtensionCommandRegistration
        COMMAND = 'GenerateOrUpdateStructureFromExtension'
        RELATION_KIND = 'generated_from'
        RELATION_ROLE = 'extension_source'

        module_function

        def install(runtime)
          return if runtime.commands.registered?(COMMAND)

          repository = Repository.new
          geometry = Geometry.new
          validator = Validators::StructureValidator.new

          runtime.commands.register(
            COMMAND,
            owner_module: 'constructflow.structure',
            validator: ->(command) { validation_errors(command[:input]) }
          ) do |command|
            generate_or_update(
              runtime: runtime,
              input: command[:input],
              repository: repository,
              geometry: geometry,
              validator: validator
            )
          end
        end

        def generate_or_update(runtime:, input:, repository:, geometry:, validator:)
          intent = fetch(input, :intent) || {}
          extension_id = (fetch(input, :extension_id) || fetch(intent, :extension_id)).to_s
          boundary = Array(fetch(intent, :boundary_mm))
          config = fetch(intent, :config) || {}
          base_level_id = fetch(intent, :base_level_id)
          base_offset_mm = Float(fetch(intent, :base_offset_mm) || 0)
          target_height_mm = Float(fetch(intent, :target_height_mm) || 2800)
          section_mm = fetch(config, :column_section_mm) || [200, 200]
          base_elevation_mm = resolve_base_elevation(runtime, base_level_id, base_offset_mm)

          created_ids = []
          updated_ids = []
          warnings = []
          events = []

          boundary.each_with_index do |point, index|
            slot = "corner_#{index}"
            values = Array(point)
            definition = ColumnDefinition.new(
              location_mm: [values[0], values[1], base_elevation_mm],
              section_mm: section_mm,
              base_level_id: base_level_id,
              base_offset_mm: base_offset_mm,
              base_elevation_mm: base_elevation_mm,
              top_elevation_mm: base_elevation_mm + target_height_mm,
              material: fetch(config, :material) || 'reinforced_concrete',
              engineering_status: 'preliminary'
            )
            issues = validator.validate_column(definition)
            errors = issues.select { |issue| issue[:severity] == 'error' }
            raise ArgumentError, errors.map { |issue| issue[:message] }.join('; ') unless errors.empty?

            existing = find_generated_column(runtime, extension_id, slot)
            if existing
              geometry.rebuild_column!(existing.entity, definition)
              repository.write_column(existing.entity, definition)
              runtime.smart_objects.mark_dirty(existing.entity, 'dirty_quantity', 'dirty_drawing')
              updated_ids << existing.id
              events << { name: 'GeometryChanged', object_ids: [existing.id], payload: { source: extension_id, slot: slot } }
            else
              group = geometry.create_column_group(runtime.active_model, definition)
              object = runtime.smart_objects.create(
                entity: group,
                type: 'structure.column',
                owner_module: 'constructflow.structure',
                display_name: "Extension Column #{index + 1}",
                created_phase: Core::Phase::NEW_CONSTRUCTION,
                level_refs: level_refs(definition),
                source_state: 'confirmed'
              )
              repository.write_column(group, definition)
              runtime.smart_objects.add_relationship(
                group,
                kind: RELATION_KIND,
                target_id: extension_id,
                role: RELATION_ROLE,
                metadata: { 'slot' => slot, 'domain' => 'structure' }
              )
              runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
              created_ids << object.id
              events << { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'structure.column', source: extension_id, slot: slot } }
              events << { name: 'StructuralMemberCreated', object_ids: [object.id], payload: { source: extension_id, slot: slot } }
            end

            warnings.concat(issues.select { |issue| issue[:severity] != 'error' }.map { |issue| issue[:message] })
          end

          touched_ids = (created_ids + updated_ids).uniq
          events << { name: 'QuantityDirty', object_ids: touched_ids } unless touched_ids.empty?
          events << { name: 'DrawingDirty', object_ids: touched_ids } unless touched_ids.empty?

          {
            created_object_ids: created_ids,
            updated_object_ids: updated_ids,
            warnings: warnings.uniq,
            events: events
          }
        end

        def find_generated_column(runtime, extension_id, slot)
          runtime.smart_objects.all.find do |object|
            next false unless object.type == 'structure.column'

            Array(object.relationships).any? do |relationship|
              metadata = relationship['metadata'] || relationship[:metadata] || {}
              (relationship['kind'] || relationship[:kind]).to_s == RELATION_KIND &&
                (relationship['target_id'] || relationship[:target_id]).to_s == extension_id &&
                (relationship['role'] || relationship[:role]).to_s == RELATION_ROLE &&
                (metadata['slot'] || metadata[:slot]).to_s == slot
            end
          end
        end

        def validation_errors(input)
          intent = fetch(input, :intent) || {}
          extension_id = fetch(input, :extension_id) || fetch(intent, :extension_id)
          boundary = Array(fetch(intent, :boundary_mm))
          errors = []
          errors << 'extension_id required' if extension_id.to_s.strip.empty?
          errors << 'extension boundary requires at least three points' if boundary.length < 3
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

        def level_refs(definition)
          return [] if definition.base_level_id.nil? || definition.base_level_id.empty?

          [{ role: 'base', level_id: definition.base_level_id, offset_mm: definition.base_offset_mm }]
        end

        def fetch(hash, key)
          hash[key] || hash[key.to_s]
        end
      end
    end
  end
end
