# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      module Registration
        MANIFEST = {
          id: 'constructflow.extension',
          name: 'Extension',
          version: '0.1.0',
          schema_version: 1,
          requires: ['constructflow.core'],
          optional_capabilities: %w[wall.host_surface roof.generator structure.generator drainage.network],
          provides: %w[extension.boundary extension.quantity],
          objects: ['extension.zone'],
          commands: %w[CreateExtensionZone ModifyExtensionBoundary ApplyExtensionPreset SetExtensionConstructionIntent],
          events: %w[ExtensionCreated ExtensionChanged ExtensionConstructionIntentChanged GeometryChanged QuantityDirty DrawingDirty],
          providers: ['constructflow.extension.quantity'],
          validators: ['extension.zone.validity']
        }.freeze

        PRESETS = {
          'custom' => { program: 'custom', roof_intent: 'lean_to', target_height_mm: 2800 },
          'kitchen' => { program: 'kitchen', roof_intent: 'lean_to', target_height_mm: 2800 },
          'carport' => { program: 'carport', roof_intent: 'lean_to', target_height_mm: 3000 },
          'multipurpose' => { program: 'multipurpose', roof_intent: 'lean_to', target_height_mm: 2800 },
          'laundry' => { program: 'laundry', roof_intent: 'lean_to', target_height_mm: 2600 },
          'terrace' => { program: 'terrace', roof_intent: 'lean_to', target_height_mm: 2800 },
          'pergola' => { program: 'pergola', roof_intent: 'lean_to', target_height_mm: 2800 }
        }.freeze

        module_function

        def install(runtime)
          return if runtime.modules.registered?('constructflow.extension')

          runtime.module_loader.load(MANIFEST)
          repository = Repository.new
          geometry = Geometry.new
          validator = Validators::ExtensionValidator.new
          capability = BoundaryCapability.new(repository: repository)
          quantity_provider = Quantity::ExtensionQuantityProvider.new

          runtime.capabilities.register(
            'extension.boundary',
            owner_module: 'constructflow.extension',
            provider: capability
          )
          runtime.capabilities.register(
            'extension.quantity',
            owner_module: 'constructflow.extension',
            provider: quantity_provider
          )

          runtime.commands.register(
            'CreateExtensionZone',
            owner_module: 'constructflow.extension',
            validator: ->(command) { validation_errors(command[:input], runtime, validator) }
          ) do |command|
            input = command[:input]
            definition = definition_from_input(input, runtime)
            group = geometry.create_group(runtime.active_model, definition)
            smart_object = runtime.smart_objects.create(
              entity: group,
              type: 'extension.zone',
              owner_module: 'constructflow.extension',
              display_name: input[:display_name] || input['display_name'] || "#{definition.program.capitalize} Extension",
              created_phase: input[:created_phase] || input['created_phase'] || Core::Phase::NEW_CONSTRUCTION,
              level_refs: level_refs(definition),
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            repository.write(group, definition)
            if definition.attachment_host_id
              runtime.smart_objects.add_relationship(
                group,
                kind: 'host',
                target_id: definition.attachment_host_id,
                role: 'extension_attachment',
                metadata: { capability: 'wall.host_surface' }
              )
            end
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')

            {
              created_object_ids: [smart_object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [smart_object.id], payload: { type: 'extension.zone' } },
                { name: 'ExtensionCreated', object_ids: [smart_object.id], payload: { program: definition.program } },
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          runtime.commands.register(
            'ModifyExtensionBoundary',
            owner_module: 'constructflow.extension',
            validator: ->(command) { modify_validation_errors(command[:input], runtime, repository, validator) }
          ) do |command|
            input = command[:input]
            object = resolve_extension(input, runtime)
            current = repository.read(object.entity)
            updated = current.with(boundary_mm: input[:boundary_mm] || input['boundary_mm'])
            geometry.rebuild!(object.entity, updated)
            repository.write(object.entity, updated)
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing', 'dirty_dependents')

            {
              updated_object_ids: [object.id],
              events: [
                { name: 'ExtensionChanged', object_ids: [object.id], payload: { change: 'boundary' } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end

          runtime.commands.register(
            'ApplyExtensionPreset',
            owner_module: 'constructflow.extension',
            validator: ->(command) { preset_validation_errors(command[:input], runtime, repository) }
          ) do |command|
            input = command[:input]
            object = resolve_extension(input, runtime)
            current = repository.read(object.entity)
            preset_id = (input[:preset_id] || input['preset_id']).to_s
            preset = PRESETS.fetch(preset_id)
            updated = current.with(
              program: preset[:program],
              roof_intent: preset[:roof_intent],
              target_height_mm: preset[:target_height_mm]
            )
            repository.write(object.entity, updated)
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing', 'dirty_dependents')
            {
              updated_object_ids: [object.id],
              events: [
                { name: 'ExtensionChanged', object_ids: [object.id], payload: { change: 'preset', preset_id: preset_id } },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end

          install_ui(runtime)
        end

        def validation_errors(input, runtime, validator)
          definition = definition_from_input(input, runtime)
          validator.validate(definition).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def modify_validation_errors(input, runtime, repository, validator)
          object = resolve_extension(input, runtime)
          return ['extension zone not found'] unless object

          current = repository.read(object.entity)
          return ['extension definition missing'] unless current

          updated = current.with(boundary_mm: input[:boundary_mm] || input['boundary_mm'])
          validator.validate(updated).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def preset_validation_errors(input, runtime, repository)
          object = resolve_extension(input, runtime)
          return ['extension zone not found'] unless object && repository.read(object.entity)

          preset_id = (input[:preset_id] || input['preset_id']).to_s
          PRESETS.key?(preset_id) ? [] : ["unknown extension preset: #{preset_id}"]
        rescue StandardError => error
          [error.message]
        end

        def definition_from_input(input, runtime)
          level_id = input[:base_level_id] || input['base_level_id']
          boundary = Array(input[:boundary_mm] || input['boundary_mm']).map(&:dup)
          if level_id && !level_id.to_s.empty?
            level = runtime.levels.fetch(level_id)
            raise ArgumentError, "level #{level_id} has unknown elevation" if level.elevation_mm.nil?

            elevation = level.elevation_mm + Float(input[:base_offset_mm] || input['base_offset_mm'] || 0)
            boundary.each { |point| point[2] = elevation }
          end

          ExtensionDefinition.new(
            boundary_mm: boundary,
            program: input[:program] || input['program'] || 'custom',
            base_level_id: level_id,
            base_offset_mm: input[:base_offset_mm] || input['base_offset_mm'] || 0,
            target_height_mm: input[:target_height_mm] || input['target_height_mm'] || 2800,
            roof_intent: input[:roof_intent] || input['roof_intent'] || 'lean_to',
            mode: input[:mode] || input['mode'] || 'concept',
            attachment_host_id: input[:attachment_host_id] || input['attachment_host_id']
          )
        end

        def level_refs(definition)
          return [] if definition.base_level_id.nil? || definition.base_level_id.empty?

          [{ role: 'base', level_id: definition.base_level_id, offset_mm: definition.base_offset_mm }]
        end

        def resolve_extension(input, runtime)
          entity = input[:entity] || input['entity']
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(input[:object_id] || input['object_id'])
          return nil unless object && object.owner_module == 'constructflow.extension' && object.type == 'extension.zone'

          object
        end

        def install_ui(runtime)
          menu = runtime.menu.add_submenu('Extension')
          menu.add_item('Create Extension Zone from Selected Face') do
            face = runtime.active_model.selection.find { |entity| entity.is_a?(Sketchup::Face) }
            unless face
              UI.messagebox('Select one SketchUp face first.')
              next
            end

            values = UI.inputbox(
              ['Program', 'Target height (mm)', 'Roof intent'],
              ['custom', '2800', 'lean_to'],
              'ConstructFlow Extension Zone'
            )
            next unless values

            boundary_mm = face.outer_loop.vertices.map { |vertex| Core::Units.point_to_mm(vertex.position) }
            result = runtime.commands.execute(
              'CreateExtensionZone',
              {
                boundary_mm: boundary_mm,
                program: values[0].to_s,
                target_height_mm: Float(values[1]),
                roof_intent: values[2].to_s
              },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
          rescue StandardError => error
            UI.messagebox("ConstructFlow Extension error: #{error.message}")
          end
        end
      end
    end
  end
end
