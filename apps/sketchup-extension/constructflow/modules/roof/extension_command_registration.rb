# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      module ExtensionCommandRegistration
        COMMAND = 'GenerateOrUpdateRoofFromExtension'
        RELATION_KIND = 'generated_from'
        RELATION_ROLE = 'extension_source'

        module_function

        def install(runtime)
          return if runtime.commands.registered?(COMMAND)

          repository = Repository.new
          geometry = Geometry.new
          validator = Validators::RoofValidator.new

          runtime.commands.register(
            COMMAND,
            owner_module: 'constructflow.roof',
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
          roof_form = (fetch(intent, :roof_intent) || 'lean_to').to_s
          base_elevation_mm = resolve_base_elevation(runtime, base_level_id, base_offset_mm)

          definition = RoofDefinition.new(
            boundary_mm: boundary,
            roof_form: roof_form,
            slope_percent: Float(fetch(config, :slope_percent) || 5.0),
            slope_direction_xy: fetch(config, :slope_direction_xy) || [0, 1],
            low_elevation_mm: base_elevation_mm + target_height_mm,
            covering_system: fetch(config, :covering_system) || 'metal_sheet',
            thickness_mm: Float(fetch(config, :thickness_mm) || 20),
            generated_from_id: extension_id
          )

          issues = validator.validate_roof(definition)
          errors = issues.select { |issue| issue[:severity] == 'error' }
          raise ArgumentError, errors.map { |issue| issue[:message] }.join('; ') unless errors.empty?

          existing = find_generated_roof(runtime, extension_id)
          if existing
            geometry.rebuild_roof!(existing.entity, definition)
            repository.write_roof(existing.entity, definition)
            runtime.smart_objects.mark_dirty(existing.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [existing.id],
              warnings: warning_messages(issues),
              events: [
                { name: 'RoofChanged', object_ids: [existing.id], payload: { source: extension_id, change: 'extension_regeneration' } },
                { name: 'GeometryChanged', object_ids: [existing.id] },
                { name: 'QuantityDirty', object_ids: [existing.id] },
                { name: 'DrawingDirty', object_ids: [existing.id] }
              ]
            }
          else
            group = geometry.create_roof_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group,
              type: 'roof.system',
              owner_module: 'constructflow.roof',
              display_name: 'Extension Roof',
              created_phase: Core::Phase::NEW_CONSTRUCTION,
              source_state: 'confirmed'
            )
            repository.write_roof(group, definition)
            runtime.smart_objects.add_relationship(
              group,
              kind: RELATION_KIND,
              target_id: extension_id,
              role: RELATION_ROLE,
              metadata: { 'domain' => 'roof', 'slot' => 'primary' }
            )
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: [object.id],
              warnings: warning_messages(issues),
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'roof.system', source: extension_id } },
                { name: 'RoofGenerated', object_ids: [object.id], payload: { source: extension_id } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end
        end

        def find_generated_roof(runtime, extension_id)
          runtime.smart_objects.all.find do |object|
            next false unless object.type == 'roof.system'

            Array(object.relationships).any? do |relationship|
              (relationship['kind'] || relationship[:kind]).to_s == RELATION_KIND &&
                (relationship['target_id'] || relationship[:target_id]).to_s == extension_id &&
                (relationship['role'] || relationship[:role]).to_s == RELATION_ROLE
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

        def warning_messages(issues)
          issues.select { |issue| issue[:severity] != 'error' }.map { |issue| issue[:message] }.uniq
        end

        def fetch(hash, key)
          hash[key] || hash[key.to_s]
        end
      end
    end
  end
end
