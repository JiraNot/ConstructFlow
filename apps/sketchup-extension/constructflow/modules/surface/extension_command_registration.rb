# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      module ExtensionCommandRegistration
        COMMAND = 'GenerateOrUpdateSurfaceFromExtension'
        RELATION_KIND = 'generated_from'
        RELATION_ROLE = 'extension_source'
        SLOT = 'primary_floor'

        module_function

        def install(runtime)
          return if runtime.commands.registered?(COMMAND)

          repository = Repository.new
          geometry = Geometry.new
          validator = Validators::SurfaceValidator.new
          runtime.commands.register(
            COMMAND,
            owner_module: 'constructflow.surface',
            validator: ->(command) { validation_errors(command[:input], runtime, validator) }
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
          extension_id = extension_id_from(input, intent)
          definition = definition_from(input, runtime)
          issues = validator.validate_surface(definition)
          errors = issues.select { |issue| issue[:severity] == 'error' }
          raise ArgumentError, errors.map { |issue| issue[:message] }.join('; ') unless errors.empty?

          existing = find_generated(runtime, extension_id)
          created_ids = []
          updated_ids = []
          events = []
          if existing
            geometry.rebuild_surface!(existing.entity, definition)
            repository.write_surface(existing.entity, definition)
            runtime.smart_objects.mark_dirty(existing.entity, 'dirty_quantity', 'dirty_drawing', 'dirty_layout')
            updated_ids << existing.id
            events << { name: 'SurfaceChanged', object_ids: [existing.id], payload: { change: 'extension_regeneration', source: extension_id } }
            events << { name: 'GeometryChanged', object_ids: [existing.id], payload: { source: extension_id, slot: SLOT } }
          else
            group = geometry.create_surface_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group,
              type: 'surface.boundary',
              owner_module: 'constructflow.surface',
              display_name: 'Extension Floor Surface',
              created_phase: Core::Phase::NEW_CONSTRUCTION,
              level_refs: level_refs(definition),
              source_state: 'confirmed'
            )
            repository.write_surface(group, definition)
            runtime.smart_objects.add_relationship(
              group,
              kind: RELATION_KIND,
              target_id: extension_id,
              role: RELATION_ROLE,
              metadata: { 'slot' => SLOT, 'domain' => 'surface' }
            )
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing', 'dirty_layout')
            created_ids << object.id
            events << { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'surface.boundary', source: extension_id, slot: SLOT } }
            events << { name: 'SurfaceCreated', object_ids: [object.id], payload: { surface_type: definition.surface_type, source: extension_id } }
            events << { name: 'GeometryChanged', object_ids: [object.id], payload: { source: extension_id, slot: SLOT } }
          end

          touched_ids = (created_ids + updated_ids).uniq
          events << { name: 'QuantityDirty', object_ids: touched_ids } unless touched_ids.empty?
          events << { name: 'DrawingDirty', object_ids: touched_ids } unless touched_ids.empty?
          events << { name: 'ValidationStateChanged', object_ids: touched_ids, payload: { issues: issues } } unless touched_ids.empty?
          {
            created_object_ids: created_ids,
            updated_object_ids: updated_ids,
            warnings: warning_messages(issues),
            events: events
          }
        end

        def definition_from(input, runtime)
          intent = fetch(input, :intent) || {}
          config = fetch(intent, :config) || {}
          base_level_id = fetch(intent, :base_level_id)
          base_offset_mm = Float(fetch(intent, :base_offset_mm) || 0)
          elevation = resolve_base_elevation(runtime, base_level_id, base_offset_mm, fetch(intent, :boundary_mm))
          boundary = Array(fetch(intent, :boundary_mm)).map do |point|
            values = Array(point)
            [Float(values[0]), Float(values[1]), elevation]
          end
          SurfaceDefinition.new(
            outer_boundary_mm: boundary,
            holes_mm: fetch(config, :holes_mm) || [],
            surface_type: fetch(config, :surface_type) || 'concrete',
            base_level_id: base_level_id,
            base_elevation_mm: elevation,
            assembly_id: fetch(config, :assembly_id),
            drain_target_id: fetch(config, :drain_target_id)
          )
        end

        def find_generated(runtime, extension_id)
          runtime.smart_objects.all.find do |object|
            next false unless object.type == 'surface.boundary' && object.owner_module == 'constructflow.surface'

            Array(object.relationships).any? do |relationship|
              metadata = relationship['metadata'] || relationship[:metadata] || {}
              (relationship['kind'] || relationship[:kind]).to_s == RELATION_KIND &&
                (relationship['target_id'] || relationship[:target_id]).to_s == extension_id.to_s &&
                (relationship['role'] || relationship[:role]).to_s == RELATION_ROLE &&
                (metadata['slot'] || metadata[:slot]).to_s == SLOT
            end
          end
        end

        def validation_errors(input, runtime, validator)
          intent = fetch(input, :intent) || {}
          errors = []
          errors << 'extension_id required' if extension_id_from(input, intent).empty?
          definition = definition_from(input, runtime)
          errors.concat(validator.validate_surface(definition).select { |issue| issue[:severity] == 'error' }.map { |issue| issue[:message] })
          errors.uniq
        rescue StandardError => error
          [error.message]
        end

        def resolve_base_elevation(runtime, level_id, offset_mm, boundary)
          if level_id && !level_id.to_s.empty?
            level = runtime.levels.fetch(level_id)
            raise ArgumentError, "level #{level_id} has unknown elevation" if level.elevation_mm.nil?
            return Float(level.elevation_mm) + Float(offset_mm)
          end
          first = Array(boundary).first
          (first ? Float(Array(first)[2] || 0) : 0.0) + Float(offset_mm)
        end

        def level_refs(definition)
          return [] if definition.base_level_id.nil? || definition.base_level_id.empty?
          [{ role: 'base', level_id: definition.base_level_id, offset_mm: 0.0 }]
        end

        def extension_id_from(input, intent = nil)
          data = intent || fetch(input, :intent) || {}
          (fetch(input, :extension_id) || fetch(data, :extension_id)).to_s
        end

        def warning_messages(issues)
          Array(issues).reject { |issue| issue[:severity] == 'error' }.map { |issue| issue[:message].to_s }.uniq
        end

        def fetch(hash, key)
          hash[key] || hash[key.to_s]
        end
      end
    end
  end
end
