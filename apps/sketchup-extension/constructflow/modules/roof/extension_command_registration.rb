# frozen_string_literal: true

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
          edge_capability = EdgeHostCapability.new(repository: repository)
          gutter_service = ExtensionGutterService.new(
            repository: repository,
            geometry: geometry,
            validator: validator,
            edge_capability: edge_capability
          )
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
              validator: validator,
              gutter_service: gutter_service
            )
          end
        end

        def generate_or_update(runtime:, input:, repository:, geometry:, validator:, gutter_service: nil)
          intent = fetch(input, :intent) || {}
          extension_id = extension_id_from(input, intent)
          definition = definition_from(input)
          issues = validator.validate_roof(definition)
          errors = issues.select { |issue| issue[:severity] == 'error' }
          raise ArgumentError, errors.map { |issue| issue[:message] }.join('; ') unless errors.empty?

          existing = find_generated(runtime, extension_id)
          created_ids = []
          updated_ids = []
          removed_ids = []
          events = []
          roof_object = existing

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
            roof_object = object
            events << { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'roof.system', source: extension_id, slot: SLOT } }
            events << { name: 'RoofGenerated', object_ids: [object.id], payload: { source: extension_id, roof_form: definition.roof_form } }
            events << { name: 'GeometryChanged', object_ids: [object.id], payload: { source: extension_id, slot: SLOT } }
          end

          gutter_service ||= ExtensionGutterService.new(
            repository: repository,
            geometry: geometry,
            validator: validator,
            edge_capability: EdgeHostCapability.new(repository: repository)
          )
          gutter_result = gutter_service.sync(
            runtime: runtime,
            extension_id: extension_id,
            roof_object: roof_object,
            roof_definition: definition,
            config: fetch(intent, :config) || {}
          )
          created_ids.concat(Array(gutter_result[:created_object_ids]))
          updated_ids.concat(Array(gutter_result[:updated_object_ids]))
          removed_ids.concat(Array(gutter_result[:removed_object_ids]))
          events.concat(Array(gutter_result[:events]))

          touched_ids = (created_ids + updated_ids + removed_ids).uniq
          events << { name: 'QuantityDirty', object_ids: touched_ids } unless touched_ids.empty?
          events << { name: 'DrawingDirty', object_ids: touched_ids } unless touched_ids.empty?
          events << { name: 'ValidationStateChanged', object_ids: touched_ids, payload: { issues: issues } } unless touched_ids.empty?

          {
            created_object_ids: created_ids.uniq,
            updated_object_ids: updated_ids.uniq,
            removed_object_ids: removed_ids.uniq,
            warnings: (warning_messages(issues) + Array(gutter_result[:warnings])).uniq,
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
          runtime.smart_objects.all.find do |object|
            next false unless object.type == 'roof.system' && object.owner_module == 'constructflow.roof'

            generated_relation?(object, extension_id)
          end
        end

        def generated_relation?(object, extension_id)
          Array(object.relationships).any? do |relationship|
            metadata = relationship['metadata'] || relationship[:metadata] || {}
            (relationship['kind'] || relationship[:kind]).to_s == RELATION_KIND &&
              (relationship['target_id'] || relationship[:target_id]).to_s == extension_id.to_s &&
              (relationship['role'] || relationship[:role]).to_s == RELATION_ROLE &&
              (metadata['slot'] || metadata[:slot]).to_s == SLOT
          end
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
