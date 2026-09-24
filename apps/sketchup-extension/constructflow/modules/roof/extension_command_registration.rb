# frozen_string_literal: true

require_relative '../../core/extension_command_support'

module JiraNot
  module ConstructFlow
    module Roof
      module ExtensionCommandRegistration
        COMMAND = 'GenerateOrUpdateRoofFromExtension'
        RELATION_KIND = 'generated_from'
        RELATION_ROLE = 'extension_source'
        SLOT = 'primary'

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
          extension_id = extension_id_from(input, intent)
          definition = definition_from(input)
          issues = validator.validate_roof(definition)
          errors = issues.select { |issue| issue[:severity] == 'error' }
          raise ArgumentError, errors.map { |issue| issue[:message] }.join('; ') unless errors.empty?

          existing = find_generated(runtime, extension_id)
          created_ids = []
          updated_ids = []
          events = []

          if existing
            geometry.rebuild_roof!(existing.entity, definition)
            repository.write_roof(existing.entity, definition)
            runtime.smart_objects.mark_dirty(existing.entity, 'dirty_quantity', 'dirty_drawing')
            updated_ids << existing.id
            events << { name: 'RoofChanged', object_ids: [existing.id], payload: { change: 'extension_regeneration', source: extension_id } }
            events << { name: 'GeometryChanged', object_ids: [existing.id], payload: { source: extension_id, slot: SLOT } }
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
              metadata: { 'slot' => SLOT, 'domain' => 'roof' }
            )
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            created_ids << object.id
            events << { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'roof.system', source: extension_id, slot: SLOT } }
            events << { name: 'RoofGenerated', object_ids: [object.id], payload: { source: extension_id, roof_form: definition.roof_form } }
            events << { name: 'GeometryChanged', object_ids: [object.id], payload: { source: extension_id, slot: SLOT } }
          end

          touched_ids = (created_ids + updated_ids).uniq
          events.concat(Core::ExtensionCommandSupport.dirty_events(touched_ids))
          events << { name: 'ValidationStateChanged', object_ids: touched_ids, payload: { issues: issues } } unless touched_ids.empty?

          {
            created_object_ids: created_ids,
            updated_object_ids: updated_ids,
            warnings: warning_messages(issues),
            events: events
          }
        end

        def definition_from(input)
          intent = fetch(input, :intent) || {}
          config = fetch(intent, :config) || {}
          boundary = Array(fetch(intent, :boundary_mm))
          target_height = Float(fetch(intent, :target_height_mm) || 2800)
          base_top = boundary.map { |point| Float(Array(point)[2] || 0) }.max || 0.0
          requested_form = (fetch(config, :roof_form) || fetch(intent, :roof_intent) || 'lean_to').to_s
          form = RoofDefinition::FORMS.include?(requested_form) ? requested_form : 'lean_to'
          covering = fetch(config, :covering_system)
          covering = nil if covering.to_s == 'from_extension'

          RoofDefinition.new(
            boundary_mm: boundary,
            roof_form: form,
            slope_percent: fetch(config, :slope_percent) || (form == 'flat' ? 0.0 : 5.0),
            slope_direction_xy: fetch(config, :slope_direction_xy) || [0, 1],
            low_elevation_mm: fetch(config, :low_elevation_mm) || (base_top + target_height),
            covering_system: covering || 'metal_sheet',
            thickness_mm: fetch(config, :thickness_mm) || 20,
            generated_from_id: extension_id_from(input, intent)
          )
        end

        def find_generated(runtime, extension_id)
          Core::ExtensionCommandSupport.find_generated(
            runtime, extension_id,
            type: 'roof.system', owner_module: 'constructflow.roof', slot: SLOT,
            kind: RELATION_KIND, role: RELATION_ROLE
          )
        end

        def generated_relation?(object, extension_id)
          Core::ExtensionCommandSupport.generated_relation?(
            object, extension_id,
            kind: RELATION_KIND, role: RELATION_ROLE, slot: SLOT
          )
        end

        def validation_errors(input)
          definition = definition_from(input)
          errors = []
          errors << 'extension_id required' if definition.generated_from_id.to_s.empty?
          errors.concat(definition.errors)
          errors.uniq
        rescue StandardError => error
          [error.message]
        end

        def extension_id_from(input, intent = nil)
          Core::ExtensionCommandSupport.extension_id_from(input, intent)
        end

        def warning_messages(issues)
          Array(issues).reject { |issue| issue[:severity] == 'error' }.map { |issue| issue[:message].to_s }.uniq
        end

        def fetch(hash, key)
          Core::ExtensionCommandSupport.fetch(hash, key)
        end
      end
    end
  end
end
