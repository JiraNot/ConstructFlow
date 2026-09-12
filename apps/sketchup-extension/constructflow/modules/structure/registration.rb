# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      module Registration
        MANIFEST = {
          id: 'constructflow.structure',
          name: 'Structure',
          version: '0.1.0',
          schema_version: 1,
          requires: ['constructflow.core'],
          optional_capabilities: %w[drainage.network roof.frame_intent site.ground_reference],
          provides: %w[structure.coordination structure.quantity],
          objects: %w[structure.grid structure.beam structure.column structure.foundation structure.rebar_set],
          commands: %w[CreateStructuralGrid ModifyStructuralGrid CreateBeam ModifyBeamPath CreateColumn EditColumnSchedule GenerateFoundation AssignRebarSet ModifyRebarSet],
          events: %w[StructuralMemberCreated FoundationGenerated RebarSetAssigned RebarSetChanged GeometryChanged QuantityDirty DrawingDirty ValidationStateChanged],
          providers: ['constructflow.structure.quantity'],
          validators: %w[structure.column.validity structure.foundation.validity structure.rebar.validity]
        }.freeze

        module_function

        BEAM_SCHEDULE = Core::ScheduleDefinition.new(
          id: 'structure.beam.schedule',
          name: 'Structural Beam Schedule',
          object_type: 'structure.beam',
          columns: [
            { id: 'material', label: 'Material', field_type: 'text', editable: true, scope: 'instance' },
            { id: 'engineering_status', label: 'Engineering Status', field_type: 'text', editable: true, scope: 'instance' },
            { id: 'length_m', label: 'Length (m)', field_type: 'number', calculated: true },
            { id: 'volume_m3', label: 'Volume (m³)', field_type: 'number', calculated: true },
            { id: 'section_mm', label: 'Section (mm)', field_type: 'text', calculated: true }
          ]
        ).freeze

        COLUMN_SCHEDULE = Core::ScheduleDefinition.new(
          id: 'structure.column.schedule',
          name: 'Structural Column Schedule',
          object_type: 'structure.column',
          columns: [
            { id: 'material', label: 'Material', field_type: 'text', editable: true, scope: 'instance' },
            { id: 'engineering_status', label: 'Engineering Status', field_type: 'text', editable: true, scope: 'instance' },
            { id: 'height_m', label: 'Height (m)', field_type: 'number', calculated: true },
            { id: 'volume_m3', label: 'Volume (m³)', field_type: 'number', calculated: true },
            { id: 'section_mm', label: 'Section (mm)', field_type: 'text', calculated: true }
          ]
        ).freeze

        def schedule_editor(runtime)
          repository = Repository.new
          Core::ScheduleEditor.new(
            schema: BEAM_SCHEDULE,
            row_provider: lambda { |object|
              definition = repository.read_beam(object.entity)
              {
                material: definition.material,
                engineering_status: definition.engineering_status,
                length_m: definition.length_mm / 1000.0,
                volume_m3: definition.volume_mm3 / 1_000_000_000.0,
                section_mm: definition.section_mm.map { |value| value.round(2) }.join(' x ')
              }
            },
            updater: lambda { |change| beam_schedule_update_result(runtime, change) }
          )
        end

        def column_schedule_editor(runtime)
          repository = Repository.new
          Core::ScheduleEditor.new(
            schema: COLUMN_SCHEDULE,
            row_provider: lambda { |object|
              definition = repository.read_column(object.entity)
              {
                material: definition.material,
                engineering_status: definition.engineering_status,
                height_m: definition.height_mm / 1000.0,
                volume_m3: definition.volume_mm3 / 1_000_000_000.0,
                section_mm: definition.section_mm.map { |value| value.round(2) }.join(' x ')
              }
            },
            updater: lambda { |change| column_schedule_update_result(runtime, change) }
          )
        end

        def install(runtime)
          return if runtime.modules.registered?('constructflow.structure')

          runtime.module_loader.load(MANIFEST)
          repository = Repository.new
          geometry = Geometry.new
          validator = Validators::StructureValidator.new
          coordination = CoordinationCapability.new(repository: repository)
          quantity_provider = Quantity::StructureQuantityProvider.new

          runtime.capabilities.register(
            'structure.coordination',
            owner_module: 'constructflow.structure',
            provider: coordination
          )
          runtime.capabilities.register(
            'structure.quantity',
            owner_module: 'constructflow.structure',
            provider: quantity_provider
          )

          register_create_column(runtime, repository, geometry, validator)
          register_column_schedule_command(runtime, repository, geometry)
          register_grid_commands(runtime, repository, GridGeometry.new)
          register_beam_commands(runtime, repository, BeamGeometry.new)
          register_generate_foundation(runtime, repository, geometry, validator)
          register_assign_rebar(runtime, repository, geometry, validator, coordination)
          register_modify_rebar(runtime, repository, geometry, validator, coordination)
          install_level_change_subscription(runtime, repository, geometry)
          install_ui(runtime)
        end

        def install_level_change_subscription(runtime, repository, geometry)
          return unless runtime.respond_to?(:events)

          runtime.events.subscribe('LevelChanged', owner: MANIFEST[:id]) do |event|
            reconcile_level_dependents(runtime, repository, geometry, event)
          end
        end

        def register_create_column(runtime, repository, geometry, validator)
          runtime.commands.register(
            'CreateColumn',
            owner_module: 'constructflow.structure',
            validator: ->(command) { column_validation_errors(command[:input], runtime, validator) }
          ) do |command|
            input = command[:input]
            definition = column_definition_from_input(input, runtime)
            group = geometry.create_column_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group,
              type: 'structure.column',
              owner_module: 'constructflow.structure',
              display_name: input[:display_name] || input['display_name'] || 'Structural Column',
              created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
              level_refs: column_level_refs(definition),
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            repository.write_column(group, definition)
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            issues = validator.validate_column(definition)

            {
              created_object_ids: [object.id],
              warnings: warning_messages(issues),
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'structure.column' } },
                { name: 'StructuralMemberCreated', object_ids: [object.id], payload: { engineering_status: definition.engineering_status } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] },
                { name: 'ValidationStateChanged', object_ids: [object.id], payload: { issues: issues } }
              ]
            }
          end
        end

        def register_column_schedule_command(runtime, repository, geometry)
          runtime.commands.register(
            'EditColumnSchedule',
            owner_module: MANIFEST[:id],
            validator: ->(command) { column_schedule_validation_errors(command[:input], runtime, repository) }
          ) do |command|
            input = command[:input]
            object = resolve_column(input, runtime)
            current = repository.read_column(object.entity)
            field_id = (input[:field_id] || input['field_id']).to_s
            value = input.key?(:value) ? input[:value] : input['value']
            updated = case field_id
                      when 'material' then current.with(material: value)
                      when 'engineering_status' then current.with(engineering_status: value)
                      else raise ArgumentError, "column schedule field is not editable: #{field_id}"
                      end
            geometry.rebuild_column!(object.entity, updated)
            repository.write_column(object.entity, updated)
            runtime.smart_objects.mark_dirty_with_dependents(object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [object.id],
              events: [
                { name: 'StructuralMemberChanged', object_ids: [object.id], payload: { field_id: field_id } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] },
                { name: 'ScheduleDirty', object_ids: [object.id], payload: { schedule_id: COLUMN_SCHEDULE.id } }
              ]
            }
          end
        end

        def register_grid_commands(runtime, repository, geometry)
          runtime.commands.register(
            'CreateStructuralGrid',
            owner_module: MANIFEST[:id],
            validator: ->(command) { grid_validation_errors(command[:input], runtime) }
          ) do |command|
            input = command[:input]
            definition = grid_definition_from_input(input, runtime)
            group = geometry.create_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group,
              type: 'structure.grid',
              owner_module: MANIFEST[:id],
              display_name: definition.name,
              created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
              level_refs: grid_level_refs(definition),
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            repository.write_grid(group, definition)
            runtime.smart_objects.mark_dirty(group, 'dirty_drawing')
            {
              created_object_ids: [object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'structure.grid' } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end

          runtime.commands.register(
            'ModifyStructuralGrid',
            owner_module: MANIFEST[:id],
            validator: ->(command) { modify_grid_validation_errors(command[:input], runtime, repository) }
          ) do |command|
            input = command[:input]
            object = resolve_grid(input, runtime)
            current = repository.read_grid(object.entity)
            updated = current.with(path_mm: input[:path_mm] || input['path_mm'])
            geometry.rebuild!(object.entity, updated)
            repository.write_grid(object.entity, updated)
            runtime.smart_objects.update_level_refs(object.entity, grid_level_refs(updated))
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_drawing')
            {
              updated_object_ids: [object.id],
              events: [
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end
        end

        def register_beam_commands(runtime, repository, geometry)
          runtime.commands.register(
            'CreateBeam',
            owner_module: MANIFEST[:id],
            validator: ->(command) { beam_validation_errors(command[:input], runtime) }
          ) do |command|
            input = command[:input]
            definition = beam_definition_from_input(input, runtime)
            group = geometry.create_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group, type: 'structure.beam', owner_module: MANIFEST[:id],
              display_name: input[:display_name] || input['display_name'] || 'Structural Beam',
              created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
              level_refs: beam_level_refs(definition), source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            repository.write_beam(group, definition)
            sync_beam_supports(runtime, object, definition)
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: [object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'structure.beam' } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end

          runtime.commands.register(
            'ModifyBeamPath',
            owner_module: MANIFEST[:id],
            validator: ->(command) { modify_beam_validation_errors(command[:input], runtime, repository) }
          ) do |command|
            input = command[:input]
            object = resolve_beam(input, runtime)
            current = repository.read_beam(object.entity)
            updated = current.with(path_mm: input[:path_mm] || input['path_mm'])
            geometry.rebuild!(object.entity, updated)
            repository.write_beam(object.entity, updated)
            sync_beam_supports(runtime, object, updated)
            runtime.smart_objects.update_level_refs(object.entity, beam_level_refs(updated))
            mark_dirty_with_dependents(runtime, object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [object.id],
              events: [
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end

          runtime.commands.register(
            'EditBeamSchedule',
            owner_module: MANIFEST[:id],
            validator: ->(command) { beam_schedule_validation_errors(command[:input], runtime, repository) }
          ) do |command|
            input = command[:input]
            object = resolve_beam(input, runtime)
            current = repository.read_beam(object.entity)
            field_id = (input[:field_id] || input['field_id']).to_s
            value = input.key?(:value) ? input[:value] : input['value']
            updated = case field_id
                      when 'material' then current.with(material: value)
                      when 'engineering_status' then current.with(engineering_status: value)
                      else raise ArgumentError, "beam schedule field is not editable: #{field_id}"
                      end
            repository.write_beam(object.entity, updated)
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [object.id],
              events: [
                { name: 'ParametersChanged', object_ids: [object.id], payload: { field_id: field_id } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] },
                { name: 'ScheduleDirty', object_ids: [object.id], payload: { schedule_id: BEAM_SCHEDULE.id } }
              ]
            }
          end
        end

        def register_generate_foundation(runtime, repository, geometry, validator)
          runtime.commands.register(
            'GenerateFoundation',
            owner_module: 'constructflow.structure',
            validator: ->(command) { foundation_validation_errors(command[:input], runtime, repository, validator) }
          ) do |command|
            input = command[:input]
            column = resolve_column(input, runtime)
            column_definition = repository.read_column(column.entity)
            definition = foundation_definition_from_input(input, column, column_definition)
            group = geometry.create_foundation_group(runtime.active_model, definition)
            foundation = runtime.smart_objects.create(
              entity: group,
              type: 'structure.foundation',
              owner_module: 'constructflow.structure',
              display_name: input[:display_name] || input['display_name'] || definition.foundation_type.tr('_', ' ').capitalize,
              created_phase: column.created_phase,
              source_state: input[:source_state] || input['source_state'] || column.source_state
            )
            repository.write_foundation(group, definition)
            runtime.smart_objects.add_relationship(
              group,
              kind: 'supports',
              target_id: column.id,
              role: 'foundation_support'
            )
            runtime.smart_objects.add_relationship(
              column.entity,
              kind: 'supported_by',
              target_id: foundation.id,
              role: 'foundation_support'
            )
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(column.entity, 'dirty_quantity', 'dirty_drawing')
            issues = validator.validate_foundation(definition)

            {
              created_object_ids: [foundation.id],
              updated_object_ids: [column.id],
              warnings: warning_messages(issues),
              events: [
                { name: 'ObjectCreated', object_ids: [foundation.id], payload: { type: 'structure.foundation' } },
                { name: 'FoundationGenerated', object_ids: [foundation.id, column.id], payload: { foundation_type: definition.foundation_type } },
                { name: 'RelationshipChanged', object_ids: [foundation.id, column.id], payload: { kind: 'supports' } },
                { name: 'GeometryChanged', object_ids: [foundation.id] },
                { name: 'QuantityDirty', object_ids: [foundation.id, column.id] },
                { name: 'DrawingDirty', object_ids: [foundation.id, column.id] },
                { name: 'ValidationStateChanged', object_ids: [foundation.id], payload: { issues: issues } }
              ]
            }
          end
        end

        def register_assign_rebar(runtime, repository, geometry, validator, coordination)
          runtime.commands.register(
            'AssignRebarSet',
            owner_module: 'constructflow.structure',
            validator: ->(command) { rebar_validation_errors(command[:input], runtime, validator, coordination) }
          ) do |command|
            input = command[:input]
            host = resolve_structural_host(input, runtime, coordination)
            definition = rebar_definition_from_input(input, host, coordination)
            group = geometry.create_rebar_marker_group(
              runtime.active_model,
              host_object: host,
              definition: definition,
              host_bounds: coordination.bounding_box_mm(host)
            )
            rebar = runtime.smart_objects.create(
              entity: group,
              type: 'structure.rebar_set',
              owner_module: 'constructflow.structure',
              display_name: input[:display_name] || input['display_name'] || "Rebar Set D#{definition.diameter_mm.round}",
              created_phase: host.created_phase,
              source_state: input[:source_state] || input['source_state'] || host.source_state
            )
            repository.write_rebar_set(group, definition)
            runtime.smart_objects.add_relationship(
              group,
              kind: 'host',
              target_id: host.id,
              role: 'reinforcement_host'
            )
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(host.entity, 'dirty_quantity', 'dirty_drawing')
            issues = validator.validate_rebar_set(definition)

            {
              created_object_ids: [rebar.id],
              updated_object_ids: [host.id],
              warnings: warning_messages(issues),
              events: [
                { name: 'ObjectCreated', object_ids: [rebar.id], payload: { type: 'structure.rebar_set' } },
                { name: 'RebarSetAssigned', object_ids: [rebar.id, host.id], payload: { bbs: definition.bbs_row } },
                { name: 'RelationshipChanged', object_ids: [rebar.id, host.id], payload: { kind: 'host' } },
                { name: 'QuantityDirty', object_ids: [rebar.id, host.id] },
                { name: 'DrawingDirty', object_ids: [rebar.id, host.id] },
                { name: 'ValidationStateChanged', object_ids: [rebar.id], payload: { issues: issues } }
              ]
            }
          end
        end

        def register_modify_rebar(runtime, repository, geometry, validator, coordination)
          runtime.commands.register(
            'ModifyRebarSet',
            owner_module: 'constructflow.structure',
            validator: ->(command) { modify_rebar_validation_errors(command[:input], runtime, repository, validator, coordination) }
          ) do |command|
            input = command[:input]
            rebar = resolve_rebar_set(input, runtime)
            current = repository.read_rebar_set(rebar.entity)
            host = runtime.smart_objects.fetch_by_id(current.host_object_id)
            updated = current.with(
              diameter_mm: value_or(input, :diameter_mm, current.diameter_mm),
              bar_count: value_or(input, :bar_count, current.bar_count),
              length_each_mm: value_or(input, :length_each_mm, current.length_each_mm),
              bar_grade: value_or(input, :bar_grade, current.bar_grade),
              role: value_or(input, :role, current.role),
              shape_code: value_or(input, :shape_code, current.shape_code),
              cover_mm: value_or(input, :cover_mm, current.cover_mm)
            )
            geometry.rebuild_rebar_marker!(
              rebar.entity,
              host_object: host,
              definition: updated,
              host_bounds: coordination.bounding_box_mm(host)
            )
            repository.write_rebar_set(rebar.entity, updated)
            runtime.smart_objects.mark_dirty(rebar.entity, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(host.entity, 'dirty_quantity', 'dirty_drawing')
            issues = validator.validate_rebar_set(updated)

            {
              updated_object_ids: [rebar.id, host.id],
              warnings: warning_messages(issues),
              events: [
                { name: 'RebarSetChanged', object_ids: [rebar.id, host.id], payload: { bbs: updated.bbs_row } },
                { name: 'QuantityDirty', object_ids: [rebar.id, host.id] },
                { name: 'DrawingDirty', object_ids: [rebar.id, host.id] },
                { name: 'ValidationStateChanged', object_ids: [rebar.id], payload: { issues: issues } }
              ]
            }
          end
        end

        def column_definition_from_input(input, runtime)
          base_level_id = input[:base_level_id] || input['base_level_id']
          top_level_id = input[:top_level_id] || input['top_level_id']
          base_offset = Float(input[:base_offset_mm] || input['base_offset_mm'] || 0)
          top_offset = Float(input[:top_offset_mm] || input['top_offset_mm'] || 0)
          base_elevation = resolve_elevation(
            runtime, level_id: base_level_id,
            offset_mm: base_offset,
            explicit_mm: input[:base_elevation_mm] || input['base_elevation_mm'],
            default_mm: 0
          )
          top_elevation = resolve_elevation(
            runtime, level_id: top_level_id,
            offset_mm: top_offset,
            explicit_mm: input[:top_elevation_mm] || input['top_elevation_mm'],
            default_mm: base_elevation + Float(input[:height_mm] || input['height_mm'] || 2800)
          )
          location = Array(input[:location_mm] || input['location_mm'] || [0, 0, base_elevation]).dup
          location[2] = base_elevation

          ColumnDefinition.new(
            location_mm: location,
            section_mm: input[:section_mm] || input['section_mm'] || [200, 200],
            base_level_id: base_level_id,
            top_level_id: top_level_id,
            base_offset_mm: base_offset,
            top_offset_mm: top_offset,
            base_elevation_mm: base_elevation,
            top_elevation_mm: top_elevation,
            material: input[:material] || input['material'] || 'reinforced_concrete',
            section_type: input[:section_type] || input['section_type'] || 'rectangular',
            engineering_status: input[:engineering_status] || input['engineering_status'] || 'preliminary',
            anchor: input[:anchor] || input['anchor'] || :center,
            profile_code: input[:profile_code] || input['profile_code']
          )
        end

        def grid_definition_from_input(input, runtime)
          level_id = input[:level_id] || input['level_id']
          offset_mm = Float(input[:offset_mm] || input['offset_mm'] || 0)
          path = Array(input[:path_mm] || input['path_mm'])
          unless level_id.to_s.empty?
            elevation = level_elevation(runtime, level_id) + offset_mm
            path = path.map { |point| [Array(point)[0], Array(point)[1], elevation] }
          end
          GridDefinition.new(
            name: input[:name] || input['name'] || 'Grid',
            path_mm: path,
            level_id: level_id,
            offset_mm: offset_mm
          )
        end

        def grid_level_refs(definition)
          return [] if definition.level_id.to_s.empty?

          [{ role: 'grid_plane', level_id: definition.level_id, offset_mm: definition.offset_mm }]
        end

        def grid_validation_errors(input, runtime)
          grid_definition_from_input(input, runtime).errors
        rescue StandardError => error
          [error.message]
        end

        def modify_grid_validation_errors(input, runtime, repository)
          object = resolve_grid(input, runtime)
          return ['structural grid not found'] unless object
          current = repository.read_grid(object.entity)
          return ['grid definition missing'] unless current

          current.with(path_mm: input[:path_mm] || input['path_mm']).errors
        rescue StandardError => error
          [error.message]
        end

        def resolve_grid(input, runtime)
          entity = input[:entity] || input['entity']
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(input[:object_id] || input['object_id'])
          return nil unless object && object.owner_module == MANIFEST[:id] && object.type == 'structure.grid'

          object
        end

        def beam_definition_from_input(input, runtime)
          level_id = input[:base_level_id] || input['base_level_id'] || input[:level_id] || input['level_id']
          offset_mm = Float(input[:base_offset_mm] || input['base_offset_mm'] || 0)
          explicit_base = input[:base_elevation_mm] || input['base_elevation_mm']
          base_elevation = if level_id.to_s.empty?
                             explicit_base.nil? || explicit_base == '' ? Float(Array(input[:path_mm] || input['path_mm']).first&.[](2) || 0) : Float(explicit_base)
                           else
                             level_elevation(runtime, level_id) + offset_mm
                           end
          path = Array(input[:path_mm] || input['path_mm']).map { |point| [Array(point)[0], Array(point)[1], base_elevation] }
          BeamDefinition.new(
            path_mm: path,
            section_mm: input[:section_mm] || input['section_mm'] || [200, 300],
            base_level_id: level_id,
            base_offset_mm: offset_mm,
            base_elevation_mm: base_elevation,
            material: input[:material] || input['material'] || 'reinforced_concrete',
            engineering_status: input[:engineering_status] || input['engineering_status'] || 'preliminary',
            anchor: input[:anchor] || input['anchor'] || :top_center,
            profile_code: input[:profile_code] || input['profile_code']
          )
        end

        def beam_level_refs(definition)
          return [] if definition.base_level_id.to_s.empty?

          [{ role: 'base', level_id: definition.base_level_id, offset_mm: definition.base_offset_mm }]
        end

        def beam_validation_errors(input, runtime)
          beam_definition_from_input(input, runtime).errors
        rescue StandardError => error
          [error.message]
        end

        def modify_beam_validation_errors(input, runtime, repository)
          object = resolve_beam(input, runtime)
          return ['structural beam not found'] unless object
          current = repository.read_beam(object.entity)
          return ['beam definition missing'] unless current

          current.with(path_mm: input[:path_mm] || input['path_mm']).errors
        rescue StandardError => error
          [error.message]
        end

        def resolve_beam(input, runtime)
          entity = input[:entity] || input['entity']
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(input[:object_id] || input['object_id'])
          return nil unless object && object.owner_module == MANIFEST[:id] && object.type == 'structure.beam'

          object
        end

        def beam_schedule_validation_errors(input, runtime, repository)
          object = resolve_beam(input, runtime)
          return ['structural beam not found'] unless object

          current = repository.read_beam(object.entity)
          return ['beam definition missing'] unless current

          field_id = (input[:field_id] || input['field_id']).to_s
          value = input.key?(:value) ? input[:value] : input['value']
          updated = case field_id
                    when 'material' then current.with(material: value)
                    when 'engineering_status' then current.with(engineering_status: value)
                    else raise ArgumentError, "beam schedule field is not editable: #{field_id}"
                    end
          updated.errors
        rescue StandardError => error
          [error.message]
        end

        def beam_schedule_update_result(runtime, change)
          runtime.commands.execute(
            'EditBeamSchedule',
            { object_id: change[:object_id], field_id: change[:field_id], value: change[:value] },
            project_id: runtime.project.project_id
          )
        end

        def column_schedule_validation_errors(input, runtime, repository)
          object = resolve_column(input, runtime)
          return ['structural column not found'] unless object

          current = repository.read_column(object.entity)
          return ['column definition missing'] unless current

          field_id = (input[:field_id] || input['field_id']).to_s
          value = input.key?(:value) ? input[:value] : input['value']
          updated = case field_id
                    when 'material' then current.with(material: value)
                    when 'engineering_status' then current.with(engineering_status: value)
                    else raise ArgumentError, "column schedule field is not editable: #{field_id}"
                    end
          updated.errors
        rescue StandardError => error
          [error.message]
        end

        def column_schedule_update_result(runtime, change)
          runtime.commands.execute(
            'EditColumnSchedule',
            { object_id: change[:object_id], field_id: change[:field_id], value: change[:value] },
            project_id: runtime.project.project_id
          )
        end

        def sync_beam_supports(runtime, beam_object, definition, tolerance_mm: 250.0)
          manager = runtime.smart_objects
          existing = Array(beam_object.relationships).select { |item| item['kind'].to_s == 'supported_by' }
          existing.each do |relationship|
            target = manager.fetch_by_id(relationship['target_id'] || relationship[:target_id])
            manager.remove_relationship(target.entity, kind: 'supports', target_id: beam_object.id) if target
          end
          existing.each { |relationship| manager.remove_relationship(beam_object.entity, relationship_id: relationship['id'] || relationship[:id]) }

          supports = definition.path_mm.each_with_index.filter_map do |endpoint, endpoint_index|
            candidates = manager.all.filter_map do |object|
              distance = beam_support_distance(runtime, object, endpoint)
              next unless distance && distance <= tolerance_mm

              [object, distance]
            rescue StandardError
              nil
            end
            candidate = candidates.min_by { |item| item.last }
            candidate && [candidate.first, endpoint_index]
          end.uniq { |item| item.first.id }

          supports.each do |support, endpoint_index|
            manager.add_relationship(
              beam_object.entity, kind: 'supported_by', target_id: support.id,
              role: 'beam_support', metadata: { 'endpoint_index' => endpoint_index }
            )
            manager.add_relationship(
              support.entity, kind: 'supports', target_id: beam_object.id,
              role: 'beam_support', metadata: { 'endpoint_index' => endpoint_index }
            )
          end
          supports.map(&:first).map(&:id).freeze
        end

        def beam_support_distance(runtime, object, endpoint)
          case object.type.to_s
          when 'structure.column'
            definition = Repository.new.read_column(object.entity)
            return unless definition
            dx = definition.location_mm[0] - endpoint[0]
            dy = definition.location_mm[1] - endpoint[1]
            Math.sqrt((dx * dx) + (dy * dy))
          when 'architecture.wall'
            return unless defined?(Architecture::WallRepository)
            wall = Architecture::WallRepository.new.read(object.entity)
            return unless wall
            wall.centerline_path_mm.each_cons(2).map { |first, second| point_to_segment_distance(endpoint, first, second) }.min
          end
        end

        def point_to_segment_distance(point, first, second)
          dx = second[0] - first[0]
          dy = second[1] - first[1]
          length_squared = (dx * dx) + (dy * dy)
          return Math.sqrt(((point[0] - first[0])**2) + ((point[1] - first[1])**2)) if length_squared <= 0.001

          ratio = [[((point[0] - first[0]) * dx + (point[1] - first[1]) * dy) / length_squared, 0.0].max, 1.0].min
          projected = [first[0] + ratio * dx, first[1] + ratio * dy]
          Math.sqrt(((point[0] - projected[0])**2) + ((point[1] - projected[1])**2))
        end

        def foundation_definition_from_input(input, column, column_definition)
          center = [column_definition.location_mm[0], column_definition.location_mm[1], column_definition.base_elevation_mm]
          FoundationDefinition.new(
            center_mm: center,
            size_mm: input[:size_mm] || input['size_mm'] || [800, 800, 300],
            top_elevation_mm: input[:top_elevation_mm] || input['top_elevation_mm'] || column_definition.base_elevation_mm,
            foundation_type: input[:foundation_type] || input['foundation_type'] || 'spread_footing',
            supported_object_id: column.id,
            material: input[:material] || input['material'] || 'reinforced_concrete',
            engineering_status: input[:engineering_status] || input['engineering_status'] || 'preliminary'
          )
        end

        def rebar_definition_from_input(input, host, coordination)
          cover = Float(input[:cover_mm] || input['cover_mm'] || 40)
          bounds = coordination.bounding_box_mm(host)
          dimensions = (0..2).map { |axis| bounds[:max][axis] - bounds[:min][axis] }
          default_length = [dimensions.max - (2.0 * cover), 100.0].max
          RebarSetDefinition.new(
            host_object_id: host.id,
            diameter_mm: input[:diameter_mm] || input['diameter_mm'] || 12,
            bar_count: input[:bar_count] || input['bar_count'] || 4,
            length_each_mm: input[:length_each_mm] || input['length_each_mm'] || default_length,
            bar_grade: input[:bar_grade] || input['bar_grade'] || 'SD40',
            role: input[:role] || input['role'] || 'main_bottom',
            shape_code: input[:shape_code] || input['shape_code'] || '00',
            cover_mm: cover,
            engineering_status: input[:engineering_status] || input['engineering_status'] || 'preliminary'
          )
        end

        def resolve_elevation(runtime, level_id:, offset_mm:, explicit_mm:, default_mm:)
          unless level_id.nil? || level_id.to_s.empty?
            level = runtime.levels.fetch(level_id)
            raise ArgumentError, "level #{level_id} has unknown elevation" if level.elevation_mm.nil?
            return level.elevation_mm + offset_mm
          end
          explicit_mm.nil? || explicit_mm == '' ? Float(default_mm) : Float(explicit_mm)
        end

        def column_level_refs(definition)
          refs = []
          if definition.base_level_id && !definition.base_level_id.empty?
            refs << { role: 'base', level_id: definition.base_level_id, offset_mm: definition.base_offset_mm }
          end
          if definition.top_level_id && !definition.top_level_id.empty?
            refs << { role: 'top', level_id: definition.top_level_id, offset_mm: definition.top_offset_mm }
          end
          refs
        end

        def reconcile_level_dependents(runtime, repository, geometry, event)
          level_ids = level_ids_from_event(event)
          return if level_ids.empty?

          changed_grids = runtime.smart_objects.all.filter_map do |object|
            next unless object.owner_module == MANIFEST[:id] && object.type == 'structure.grid'

            definition = repository.read_grid(object.entity)
            next unless definition && level_ids.include?(definition.level_id.to_s)

            elevation = level_elevation(runtime, definition.level_id) + definition.offset_mm
            updated = definition.with(path_mm: definition.path_mm.map { |point| [point[0], point[1], elevation] })
            next if updated.to_h == definition.to_h

            GridGeometry.new.rebuild!(object.entity, updated)
            repository.write_grid(object.entity, updated)
            runtime.smart_objects.update_level_refs(object.entity, grid_level_refs(updated))
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_drawing')
            object.id
          rescue StandardError => error
            runtime.diagnostics&.warn('level_dependent_grid_rebuild_failed', error.message, object_id: object.id)
            nil
          end

          changed_beams = runtime.smart_objects.all.filter_map do |object|
            next unless object.owner_module == MANIFEST[:id] && object.type == 'structure.beam'

            definition = repository.read_beam(object.entity)
            next unless definition && level_ids.include?(definition.base_level_id.to_s)

            elevation = level_elevation(runtime, definition.base_level_id) + definition.base_offset_mm
            updated = definition.with(
              path_mm: definition.path_mm.map { |point| [point[0], point[1], elevation] },
              base_elevation_mm: elevation
            )
            next if updated.to_h == definition.to_h

            geometry.rebuild_beam!(object.entity, updated)
            repository.write_beam(object.entity, updated)
            runtime.smart_objects.update_level_refs(object.entity, beam_level_refs(updated))
            mark_dirty_with_dependents(runtime, object.entity, 'dirty_quantity', 'dirty_drawing')
            object.id
          rescue StandardError => error
            runtime.diagnostics&.warn('level_dependent_beam_rebuild_failed', error.message, object_id: object.id)
            nil
          end

          changed_columns = {}
          changed = runtime.smart_objects.all.filter_map do |object|
            next unless object.owner_module == MANIFEST[:id] && object.type == 'structure.column'

            definition = repository.read_column(object.entity)
            next unless definition
            next unless level_ids.include?(definition.base_level_id.to_s) || level_ids.include?(definition.top_level_id.to_s)

            base_elevation = definition.base_level_id.to_s.empty? ? definition.base_elevation_mm :
              level_elevation(runtime, definition.base_level_id) + definition.base_offset_mm
            top_elevation = definition.top_level_id.to_s.empty? ? definition.top_elevation_mm :
              level_elevation(runtime, definition.top_level_id) + definition.top_offset_mm
            updated = definition.with(
              location_mm: [definition.location_mm[0], definition.location_mm[1], base_elevation],
              base_elevation_mm: base_elevation,
              top_elevation_mm: top_elevation
            )
            next if updated.to_h == definition.to_h

            geometry.rebuild_column!(object.entity, updated)
            repository.write_column(object.entity, updated)
            runtime.smart_objects.update_level_refs(object.entity, column_level_refs(updated))
            mark_dirty_with_dependents(runtime, object.entity, 'dirty_quantity', 'dirty_drawing')
            changed_columns[object.id] = updated
            object.id
          rescue StandardError => error
            runtime.diagnostics&.warn('level_dependent_column_rebuild_failed', error.message, object_id: object.id)
            nil
          end

          changed_foundations = runtime.smart_objects.all.filter_map do |object|
            next unless object.owner_module == MANIFEST[:id] && object.type == 'structure.foundation'

            definition = repository.read_foundation(object.entity)
            next unless definition && changed_columns.key?(definition.supported_object_id.to_s)

            column = changed_columns.fetch(definition.supported_object_id.to_s)
            top_offset = definition.top_elevation_mm - definition.center_mm[2]
            updated = definition.with(
              center_mm: [column.location_mm[0], column.location_mm[1], column.base_elevation_mm],
              top_elevation_mm: column.base_elevation_mm + top_offset
            )
            next if updated.to_h == definition.to_h

            geometry.rebuild_foundation!(object.entity, updated)
            repository.write_foundation(object.entity, updated)
            mark_dirty_with_dependents(runtime, object.entity, 'dirty_quantity', 'dirty_drawing')
            object.id
          rescue StandardError => error
            runtime.diagnostics&.warn('level_dependent_foundation_rebuild_failed', error.message, object_id: object.id)
            nil
          end
          changed = changed_grids + changed_beams + changed + changed_foundations
          return if changed.empty?

          runtime.events.publish(
            'GeometryChanged',
            { change: 'level_constraint_reconciled', level_ids: level_ids },
            source_module: MANIFEST[:id],
            object_ids: changed,
            caused_by_command_id: nil
          )
        end

        def level_ids_from_event(event)
          payload = event[:payload] || event['payload'] || {}
          after = payload[:after] || payload['after'] || {}
          before = payload[:before] || payload['before'] || {}
          [payload[:level_id], payload['level_id'], after[:id], after['id'], before[:id], before['id']]
            .compact.map(&:to_s).reject(&:empty?).uniq
        end

        def level_elevation(runtime, level_id)
          level = runtime.levels.fetch(level_id)
          raise ArgumentError, "level #{level_id} has unknown elevation" if level.elevation_mm.nil?

          level.elevation_mm
        end

        def mark_dirty_with_dependents(runtime, entity, *flags)
          manager = runtime.smart_objects
          if manager.respond_to?(:mark_dirty_with_dependents)
            manager.mark_dirty_with_dependents(entity, *flags)
          else
            manager.mark_dirty(entity, *flags)
          end
        end

        def column_validation_errors(input, runtime, validator)
          validator.validate_column(column_definition_from_input(input, runtime))
                   .select { |issue| issue[:severity] == 'error' }
                   .map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def foundation_validation_errors(input, runtime, repository, validator)
          column = resolve_column(input, runtime)
          return ['structural column required'] unless column
          definition = repository.read_column(column.entity)
          return ['column definition missing'] unless definition
          validator.validate_foundation(foundation_definition_from_input(input, column, definition))
                   .select { |issue| issue[:severity] == 'error' }
                   .map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def rebar_validation_errors(input, runtime, validator, coordination)
          host = resolve_structural_host(input, runtime, coordination)
          return ['compatible structural host required'] unless host
          validator.validate_rebar_set(rebar_definition_from_input(input, host, coordination))
                   .select { |issue| issue[:severity] == 'error' }
                   .map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def modify_rebar_validation_errors(input, runtime, repository, validator, coordination)
          rebar = resolve_rebar_set(input, runtime)
          return ['rebar set not found'] unless rebar
          current = repository.read_rebar_set(rebar.entity)
          return ['rebar set definition missing'] unless current
          host = runtime.smart_objects.fetch_by_id(current.host_object_id)
          return ['rebar host not found'] unless coordination.compatible?(host)
          updated = current.with(
            diameter_mm: value_or(input, :diameter_mm, current.diameter_mm),
            bar_count: value_or(input, :bar_count, current.bar_count),
            length_each_mm: value_or(input, :length_each_mm, current.length_each_mm),
            bar_grade: value_or(input, :bar_grade, current.bar_grade),
            role: value_or(input, :role, current.role),
            shape_code: value_or(input, :shape_code, current.shape_code),
            cover_mm: value_or(input, :cover_mm, current.cover_mm)
          )
          validator.validate_rebar_set(updated)
                   .select { |issue| issue[:severity] == 'error' }
                   .map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def resolve_column(input, runtime)
          object_id = input[:column_object_id] || input['column_object_id'] || input[:object_id] || input['object_id']
          entity = input[:column_entity] || input['column_entity'] || input[:entity] || input['entity']
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(object_id)
          return nil unless object && object.owner_module == 'constructflow.structure' && object.type == 'structure.column'
          object
        end

        def resolve_structural_host(input, runtime, coordination)
          object_id = input[:host_object_id] || input['host_object_id'] || input[:object_id] || input['object_id']
          entity = input[:host_entity] || input['host_entity'] || input[:entity] || input['entity']
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(object_id)
          coordination.compatible?(object) ? object : nil
        end

        def resolve_rebar_set(input, runtime)
          object_id = input[:object_id] || input['object_id']
          entity = input[:entity] || input['entity']
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(object_id)
          return nil unless object && object.owner_module == 'constructflow.structure' && object.type == 'structure.rebar_set'
          object
        end

        def value_or(input, key, default)
          return input[key] if input.key?(key)
          string_key = key.to_s
          return input[string_key] if input.key?(string_key)
          default
        end

        def warning_messages(issues)
          Array(issues).select { |issue| %w[warning info].include?(issue[:severity]) }.map { |issue| issue[:message] }
        end

        def install_ui(runtime)
          menu = runtime.menu.add_submenu('Structure')
          menu.add_item('Draw Structural Beam in Plan') do
            values = UI.inputbox(['Width (mm)', 'Depth (mm)', 'Base Level ID', 'Offset (mm)'], ['200', '300', '', '0'], 'ConstructFlow Structural Beam')
            next unless values
            runtime.active_model.select_tool(
              Tools::BeamTool.new(runtime: runtime, section_mm: [Float(values[0]), Float(values[1])], level_id: values[2].to_s, base_offset_mm: Float(values[3]))
            )
          rescue StandardError => error
            UI.messagebox("ConstructFlow Beam error: #{error.message}")
          end

          menu.add_item('Edit Structural Beam Path in Plan') do
            runtime.active_model.select_tool(
              Architecture::Tools::BoundaryEditTool.new(
                runtime: runtime, object_type: 'structure.beam', repository: repository,
                command: 'ModifyBeamPath', label: 'Structural Beam', read_method: :read_beam,
                points_method: :path_mm, input_key: :path_mm
              )
            )
          rescue StandardError => error
            UI.messagebox("ConstructFlow Beam edit error: #{error.message}")
          end

          menu.add_item('Draw Structural Grid in Plan') do
            values = UI.inputbox(['Grid name', 'Level ID', 'Offset (mm)'], ['A', '', '0'], 'ConstructFlow Structural Grid')
            next unless values
            runtime.active_model.select_tool(
              Tools::GridTool.new(runtime: runtime, name: values[0].to_s, level_id: values[1].to_s, offset_mm: Float(values[2]))
            )
          rescue StandardError => error
            UI.messagebox("ConstructFlow Grid error: #{error.message}")
          end

          menu.add_item('Edit Structural Grid in Plan') do
            runtime.active_model.select_tool(
              Architecture::Tools::BoundaryEditTool.new(
                runtime: runtime, object_type: 'structure.grid', repository: repository,
                command: 'ModifyStructuralGrid', label: 'Structural Grid', read_method: :read_grid,
                points_method: :path_mm, input_key: :path_mm
              )
            )
          rescue StandardError => error
            UI.messagebox("ConstructFlow Grid edit error: #{error.message}")
          end

          menu.add_item('Place Structural Column') do
            values = UI.inputbox(
              ['Width (mm)', 'Depth (mm)', 'Height (mm)', 'Base level ID', 'Top level ID'],
              ['200', '200', '2800', '', ''],
              'ConstructFlow Structural Column — Preliminary'
            )
            next unless values
            runtime.active_model.select_tool(
              Tools::ColumnTool.new(
                runtime: runtime,
                section_mm: [Float(values[0]), Float(values[1])],
                explicit_height_mm: Float(values[2]),
                base_level_id: values[3].to_s,
                top_level_id: values[4].to_s
              )
            )
          rescue StandardError => error
            UI.messagebox("ConstructFlow Structure error: #{error.message}")
          end

          menu.add_item('Generate Foundation for Selected Column') do
            column = selected_smart_object(runtime, 'structure.column')
            unless column
              UI.messagebox('Select one ConstructFlow structural column first.')
              next
            end
            values = UI.inputbox(
              ['Foundation type', 'Width (mm)', 'Length (mm)', 'Thickness (mm)'],
              ['spread_footing', '800', '800', '300'],
              'ConstructFlow Foundation — Preliminary'
            )
            next unless values
            result = runtime.commands.execute(
              'GenerateFoundation',
              {
                column_object_id: column.id,
                foundation_type: values[0].to_s,
                size_mm: [Float(values[1]), Float(values[2]), Float(values[3])]
              },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
          rescue StandardError => error
            UI.messagebox("ConstructFlow Foundation error: #{error.message}")
          end

          menu.add_item('Assign Semantic Rebar Set') do
            host = runtime.active_model.selection.filter_map { |entity| runtime.smart_objects.fetch(entity) }
                          .find { |object| %w[structure.column structure.foundation].include?(object.type) }
            unless host
              UI.messagebox('Select one structural column or foundation first.')
              next
            end
            values = UI.inputbox(
              ['Diameter (mm)', 'Bar count', 'Length each (mm, 0=auto)', 'Role', 'Cover (mm)'],
              ['12', '4', '0', 'main_bottom', '40'],
              'ConstructFlow Rebar Set — Preliminary'
            )
            next unless values
            length = Float(values[2])
            input = {
              host_object_id: host.id,
              diameter_mm: Float(values[0]),
              bar_count: Integer(values[1]),
              role: values[3].to_s,
              cover_mm: Float(values[4])
            }
            input[:length_each_mm] = length if length.positive?
            result = runtime.commands.execute('AssignRebarSet', input, project_id: runtime.project.project_id)
            UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
          rescue StandardError => error
            UI.messagebox("ConstructFlow Rebar error: #{error.message}")
          end
        end

        def selected_smart_object(runtime, type)
          runtime.active_model.selection.filter_map { |entity| runtime.smart_objects.fetch(entity) }
                 .find { |object| object.type == type }
        end
      end
    end
  end
end
