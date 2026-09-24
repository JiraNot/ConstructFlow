# frozen_string_literal: true

# Shared plumbing: manifest, install entry, UI wiring, reconciliation and dirty-flag helpers.
# Reopens Registration (split across registration/*.rb files).

module JiraNot
  module ConstructFlow
    module Architecture
      module Registration
        module_function


        MANIFEST = {
          id: 'constructflow.architecture',
          name: 'Architecture',
          version: '0.1.0',
          schema_version: 1,
          requires: ['constructflow.core'],
          optional_capabilities: %w[opening.host_integration surface.finish structure.coordination],
          provides: %w[wall.host_surface architecture.wall_quantity architecture.floor_quantity architecture.room_quantity architecture.ceiling_quantity],
          objects: %w[architecture.wall architecture.floor architecture.room architecture.ceiling],
          commands: %w[CreateWall ModifyWallPath MoveWall MoveWallSegment CopyWall StretchWallEndpoint ChangeWallType EditWallSchedule ChangeWallConstraints FlipWallOrientation CreateFloor ModifyFloorBoundary CreateRoom DetectRoomsFromWalls ModifyRoomBoundary EditRoomSchedule CreateCeiling ModifyCeilingBoundary],
          events: %w[GeometryChanged ParametersChanged FloorCreated FloorChanged RoomCreated RoomsDetected RoomChanged CeilingCreated CeilingChanged QuantityDirty DrawingDirty ScheduleDirty],
          providers: %w[constructflow.architecture.wall_quantity constructflow.architecture.floor_quantity constructflow.architecture.room_quantity constructflow.architecture.ceiling_quantity],
          validators: ['architecture.wall.validity']
        }.freeze


        def install(runtime)
          return if runtime.modules.registered?('constructflow.architecture')

          runtime.module_loader.load(MANIFEST)
          repository = WallRepository.new
          geometry = WallGeometry.new
          validator = Validators::WallValidator.new
          floor_repository = FloorRepository.new
          floor_geometry = FloorGeometry.new
          floor_validator = Validators::FloorValidator.new
          floor_quantity_provider = Quantity::FloorQuantityProvider.new
          room_quantity_provider = Quantity::RoomQuantityProvider.new
          room_repository = RoomRepository.new
          room_geometry = RoomGeometry.new
          room_validator = Validators::RoomValidator.new
          ceiling_repository = CeilingRepository.new
          ceiling_geometry = CeilingGeometry.new
          ceiling_validator = Validators::CeilingValidator.new
          ceiling_quantity_provider = Quantity::CeilingQuantityProvider.new
          host_capability = WallHostCapability.new(repository: repository, geometry: geometry)
          runtime.capabilities.register(
            'wall.host_surface',
            owner_module: 'constructflow.architecture',
            provider: host_capability
          )
          runtime.capabilities.register('architecture.floor_quantity', owner_module: 'constructflow.architecture', provider: floor_quantity_provider)
          runtime.capabilities.register('architecture.room_quantity', owner_module: 'constructflow.architecture', provider: room_quantity_provider)
          runtime.capabilities.register('architecture.ceiling_quantity', owner_module: 'constructflow.architecture', provider: ceiling_quantity_provider)

          runtime.commands.register(
            'CreateFloor',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { floor_validation_errors(command[:input], runtime, floor_validator) }
          ) do |command|
            input = command[:input]
            definition = floor_definition_from_input(input, runtime)
            group = floor_geometry.create_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group,
              type: 'architecture.floor',
              owner_module: 'constructflow.architecture',
              display_name: input[:display_name] || input['display_name'] || 'Architectural Floor',
              created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
              level_refs: floor_level_refs(definition),
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            floor_repository.write(group, definition)
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: [object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'architecture.floor' } },
                { name: 'FloorCreated', object_ids: [object.id] },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end

          runtime.commands.register(
            'CreateRoom',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { room_validation_errors(command[:input], runtime, room_validator) }
          ) do |command|
            input = command[:input]
            definition = room_definition_from_input(input, runtime)
            group = room_geometry.create_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group,
              type: 'architecture.room',
              owner_module: 'constructflow.architecture',
              display_name: room_display_name(definition),
              created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
              level_refs: room_level_refs(definition),
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            room_repository.write(group, definition)
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: [object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'architecture.room' } },
                { name: 'RoomCreated', object_ids: [object.id], payload: { area_mm2: definition.area_mm2 } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end

          runtime.commands.register(
            'CreateCeiling',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { ceiling_validation_errors(command[:input], runtime, ceiling_validator) }
          ) do |command|
            input = command[:input]
            definition = ceiling_definition_from_input(input, runtime)
            group = ceiling_geometry.create_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group, type: 'architecture.ceiling', owner_module: 'constructflow.architecture',
              display_name: 'Architectural Ceiling', created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
              level_refs: ceiling_level_refs(definition), source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            ceiling_repository.write(group, definition)
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: [object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'architecture.ceiling' } },
                { name: 'CeilingCreated', object_ids: [object.id] },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end

          runtime.commands.register(
            'ModifyCeilingBoundary',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { modify_ceiling_validation_errors(command[:input], runtime, ceiling_repository, ceiling_validator) }
          ) do |command|
            input = command[:input]
            object = resolve_ceiling(input, runtime)
            current = ceiling_repository.read(object.entity)
            updated = current.with(
              boundary_mm: input[:boundary_mm] || input['boundary_mm'],
              holes_mm: input[:holes_mm] || input['holes_mm'] || current.holes_mm
            )
            ceiling_geometry.rebuild!(object.entity, updated)
            ceiling_repository.write(object.entity, updated)
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [object.id],
              events: [
                { name: 'CeilingChanged', object_ids: [object.id] },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end

          runtime.commands.register(
            'DetectRoomsFromWalls',
            owner_module: 'constructflow.architecture'
          ) do |command|
            input = command[:input]
            requested_level_id = (input[:level_id] || input['level_id']).to_s
            wall_objects = runtime.smart_objects.all.select do |object|
              object.type == 'architecture.wall' && object.owner_module == 'constructflow.architecture'
            end.filter_map do |object|
              definition = repository.read(object.entity)
              next unless definition
              next if !requested_level_id.empty? && definition.base_level_id.to_s != requested_level_id

              [object, definition]
            end
            walls = wall_objects.map(&:last)
            boundaries = RoomEnclosureDetector.new.detect(walls: walls)
            prefix = (input[:name_prefix] || input['name_prefix'] || 'Room').to_s
            created_ids = []
            boundaries.each_with_index do |boundary, index|
              definition = RoomDefinition.new(
                boundary_mm: boundary,
                level_id: input[:level_id] || input['level_id'],
                name: "#{prefix} #{index + 1}",
                number: format('%s-%02d', prefix, index + 1),
                program: input[:program] || input['program'] || 'generic',
                finish_metadata: {
                  'generated_from_walls' => true,
                  'source_wall_ids' => wall_objects.map { |object, _definition| object.id.to_s }
                }
              )
              group = room_geometry.create_group(runtime.active_model, definition)
              object = runtime.smart_objects.create(
                entity: group,
                type: 'architecture.room',
                owner_module: 'constructflow.architecture',
                display_name: room_display_name(definition),
                created_phase: runtime.project.working_phase,
                level_refs: room_level_refs(definition),
                source_state: 'assumed'
              )
              room_repository.write(group, definition)
              runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
              created_ids << object.id
            end
            {
              created_object_ids: created_ids,
              warnings: boundaries.empty? ? ['no closed room enclosure detected from room-bounding walls'] : [],
              events: [
                { name: 'RoomsDetected', object_ids: created_ids, payload: { count: created_ids.length } },
                { name: 'QuantityDirty', object_ids: created_ids },
                { name: 'DrawingDirty', object_ids: created_ids }
              ]
            }
          end

          runtime.commands.register(
            'ModifyRoomBoundary',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { modify_room_validation_errors(command[:input], runtime, room_repository, room_validator) }
          ) do |command|
            input = command[:input]
            object = resolve_room(input, runtime)
            current = room_repository.read(object.entity)
            updated = current.with(boundary_mm: input[:boundary_mm] || input['boundary_mm'])
            room_geometry.rebuild!(object.entity, updated)
            room_repository.write(object.entity, updated)
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [object.id],
              events: [
                { name: 'RoomChanged', object_ids: [object.id], payload: { area_mm2: updated.area_mm2 } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end

          runtime.commands.register(
            'EditRoomSchedule',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { room_schedule_validation_errors(command[:input], runtime, room_repository, room_validator) }
          ) do |command|
            input = command[:input]
            object = resolve_room(input, runtime)
            current = room_repository.read(object.entity)
            field_id = (input[:field_id] || input['field_id']).to_s
            value = input.key?(:value) ? input[:value] : input['value']
            updated = case field_id
                      when 'name' then current.with(name: value)
                      when 'number' then current.with(number: value)
                      when 'program' then current.with(program: value)
                      when 'usage' then current.with(usage: value)
                      else raise ArgumentError, "room schedule field is not editable: #{field_id}"
                      end
            room_repository.write(object.entity, updated)
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [object.id],
              events: [
                { name: 'RoomChanged', object_ids: [object.id], payload: { field_id: field_id } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] },
                { name: 'ScheduleDirty', object_ids: [object.id], payload: { schedule_id: ROOM_SCHEDULE.id } }
              ]
            }
          end

          runtime.commands.register(
            'EditWallSchedule',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { wall_schedule_validation_errors(command[:input], runtime, repository, validator) }
          ) do |command|
            input = command[:input]
            field_id = (input[:field_id] || input['field_id']).to_s
            value = input.key?(:value) ? input[:value] : input['value']
            type_input = { object_id: input[:object_id] || input['object_id'] }
            if field_id == 'wall_type_id'
              type_input[:wall_type_id] = value
            else
              type_input[:thickness_mm] = value
            end
            result = runtime.commands.execute('ChangeWallType', type_input, project_id: command[:project_id])
            if result[:status] == 'success'
              result.merge(
                events: Array(result[:events]) + [{
                  name: 'ScheduleDirty', object_ids: result[:updated_object_ids],
                  payload: { schedule_id: WALL_SCHEDULE.id }
                }]
              )
            else
              result
            end
          end

          runtime.commands.register(
            'ModifyFloorBoundary',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { modify_floor_validation_errors(command[:input], runtime, floor_repository, floor_validator) }
          ) do |command|
            input = command[:input]
            object = resolve_floor(input, runtime)
            current = floor_repository.read(object.entity)
            updated = current.with(
              boundary_mm: input[:boundary_mm] || input['boundary_mm'],
              holes_mm: input[:holes_mm] || input['holes_mm'] || current.holes_mm
            )
            floor_geometry.rebuild!(object.entity, updated)
            floor_repository.write(object.entity, updated)
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [object.id],
              events: [
                { name: 'FloorChanged', object_ids: [object.id] },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end

          runtime.commands.register(
            'CreateWall',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { validation_errors(command[:input], runtime, validator) }
          ) do |command|
            input = command[:input]
            definition = definition_from_input(input, runtime)
            group = geometry.create_group(runtime.active_model, definition)
            smart_object = runtime.smart_objects.create(
              entity: group,
              type: 'architecture.wall',
              owner_module: 'constructflow.architecture',
              display_name: input[:display_name] || input['display_name'] || 'Wall',
              created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
              level_refs: level_refs(input),
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            repository.write(group, definition)
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            reconcile_wall_joins(runtime, repository, geometry: geometry, tolerance_mm: 50.0)

            {
              created_object_ids: [smart_object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [smart_object.id], payload: { type: 'architecture.wall' } },
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          runtime.commands.register(
            'ModifyWallPath',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { modify_validation_errors(command[:input], runtime, repository, validator) }
          ) do |command|
            input = command[:input]
            smart_object = resolve_wall(input, runtime)
            current = repository.read(smart_object.entity)
            updated = current.with(path_mm: input[:path_mm] || input['path_mm'])
            updated = apply_level_constraints(updated, runtime)
            validate_hosted_openings!(smart_object, updated, repository, geometry)
            geometry.rebuild!(
              smart_object.entity,
              updated,
              openings: repository.host_openings(smart_object.entity)
            )
            repository.write(smart_object.entity, updated)
            runtime.smart_objects.update_level_refs(smart_object.entity, level_refs_for_definition(updated))
            mark_dirty_with_dependents(runtime, smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            reconcile_wall_joins(runtime, repository, geometry: geometry, tolerance_mm: 50.0)

            {
              updated_object_ids: [smart_object.id],
              events: [
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          runtime.commands.register(
            'MoveWall',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { transform_validation_errors(command[:input], runtime, repository, validator, :move) }
          ) do |command|
            input = command[:input]
            smart_object = resolve_wall(input, runtime)
            current = repository.read(smart_object.entity)
            updated = apply_level_constraints(current.translated(input[:delta_mm] || input['delta_mm']), runtime)
            validate_hosted_openings!(smart_object, updated, repository, geometry)
            geometry.rebuild!(smart_object.entity, updated, openings: repository.host_openings(smart_object.entity))
            repository.write(smart_object.entity, updated)
            mark_dirty_with_dependents(runtime, smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            reconcile_wall_joins(runtime, repository, geometry: geometry, tolerance_mm: 50.0)
            wall_geometry_changed_result(smart_object)
          end

          runtime.commands.register(
            'MoveWallSegment',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { transform_validation_errors(command[:input], runtime, repository, validator, :segment) }
          ) do |command|
            input = command[:input]
            smart_object = resolve_wall(input, runtime)
            current = repository.read(smart_object.entity)
            updated = apply_level_constraints(
              current.translated_segment(
                index: input[:segment_index] || input['segment_index'],
                delta_mm: input[:delta_mm] || input['delta_mm']
              ),
              runtime
            )
            validate_hosted_openings!(smart_object, updated, repository, geometry)
            geometry.rebuild!(smart_object.entity, updated, openings: repository.host_openings(smart_object.entity))
            repository.write(smart_object.entity, updated)
            runtime.smart_objects.update_level_refs(smart_object.entity, level_refs_for_definition(updated))
            mark_dirty_with_dependents(runtime, smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            reconcile_wall_joins(runtime, repository, geometry: geometry, tolerance_mm: 50.0)
            wall_geometry_changed_result(smart_object)
          end

          runtime.commands.register(
            'CopyWall',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { transform_validation_errors(command[:input], runtime, repository, validator, :copy) }
          ) do |command|
            input = command[:input]
            source = resolve_wall(input, runtime)
            current = repository.read(source.entity)
            definition = apply_level_constraints(current.translated(input[:delta_mm] || input['delta_mm']), runtime)
            group = geometry.create_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group,
              type: 'architecture.wall',
              owner_module: 'constructflow.architecture',
              display_name: "#{source.display_name} Copy",
              created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
              level_refs: source.level_refs,
              source_state: source.source_state,
              relationships: [],
              revision_meta: { 'copied_from' => source.id }
            )
            repository.write(group, definition)
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            reconcile_wall_joins(runtime, repository, geometry: geometry, tolerance_mm: 50.0)
            {
              created_object_ids: [object.id],
              warnings: ['hosted openings are not copied; place new openings on the copied wall'],
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'architecture.wall', copied_from: source.id } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end

          runtime.commands.register(
            'StretchWallEndpoint',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { transform_validation_errors(command[:input], runtime, repository, validator, :stretch) }
          ) do |command|
            input = command[:input]
            smart_object = resolve_wall(input, runtime)
            current = repository.read(smart_object.entity)
            updated = current.stretched_endpoint(
              index: input[:endpoint_index] || input['endpoint_index'],
              point_mm: input[:point_mm] || input['point_mm']
            )
            updated = apply_level_constraints(updated, runtime)
            validate_hosted_openings!(smart_object, updated, repository, geometry)
            geometry.rebuild!(smart_object.entity, updated, openings: repository.host_openings(smart_object.entity))
            repository.write(smart_object.entity, updated)
            mark_dirty_with_dependents(runtime, smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            reconcile_wall_joins(runtime, repository, geometry: geometry, tolerance_mm: 50.0)
            wall_geometry_changed_result(smart_object)
          end

          runtime.commands.register(
            'ChangeWallType',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { change_type_validation_errors(command[:input], runtime, repository, validator) }
          ) do |command|
            input = command[:input]
            smart_object = resolve_wall(input, runtime)
            current = repository.read(smart_object.entity)
            updated = current.with(
              thickness_mm: input[:thickness_mm] || input['thickness_mm'] || current.thickness_mm,
              wall_type_id: input[:wall_type_id] || input['wall_type_id'] || current.wall_type_id,
              layers: input.key?(:layers) ? input[:layers] : (input.key?('layers') ? input['layers'] : current.layers),
              core_layer_id: input.key?(:core_layer_id) ? input[:core_layer_id] : (input.key?('core_layer_id') ? input['core_layer_id'] : current.core_layer_id),
              base_level_id: input.key?(:base_level_id) ? input[:base_level_id] : (input.key?('base_level_id') ? input['base_level_id'] : current.base_level_id),
              top_constraint: input[:top_constraint] || input['top_constraint'] || current.top_constraint,
              top_constraint_level_id: input.key?(:top_constraint_level_id) ? input[:top_constraint_level_id] : (input.key?('top_constraint_level_id') ? input['top_constraint_level_id'] : current.top_constraint_level_id),
              top_offset_mm: input.key?(:top_offset_mm) ? input[:top_offset_mm] : (input.key?('top_offset_mm') ? input['top_offset_mm'] : current.top_offset_mm),
              location_line: input[:location_line] || input['location_line'] || current.location_line,
              room_bounding: input.key?(:room_bounding) ? input[:room_bounding] : (input.key?('room_bounding') ? input['room_bounding'] : current.room_bounding),
              phase_lifecycle: input[:phase_lifecycle] || input['phase_lifecycle'] || current.phase_lifecycle,
              joins: input.key?(:joins) ? input[:joins] : (input.key?('joins') ? input['joins'] : current.joins)
            )
            updated = apply_level_constraints(updated, runtime)
            geometry.rebuild!(
              smart_object.entity,
              updated,
              openings: repository.host_openings(smart_object.entity)
            )
            repository.write(smart_object.entity, updated)
            runtime.smart_objects.update_level_refs(smart_object.entity, level_refs_for_definition(updated))
            mark_dirty_with_dependents(runtime, smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            reconcile_wall_joins(runtime, repository, geometry: geometry, tolerance_mm: 50.0)

            {
              updated_object_ids: [smart_object.id],
              events: [
                { name: 'ParametersChanged', object_ids: [smart_object.id], payload: { wall_type_id: updated.wall_type_id } },
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          runtime.commands.register(
            'ChangeWallConstraints',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { change_constraints_validation_errors(command[:input], runtime, repository) }
          ) do |command|
            input = command[:input]
            smart_object = resolve_wall(input, runtime)
            current = repository.read(smart_object.entity)
            constraints = input.key?(:constraints) ? input[:constraints] : input['constraints']
            updated = apply_level_constraints(current.with(constraints: constraints || []), runtime)
            geometry.rebuild!(
              smart_object.entity,
              updated,
              openings: repository.host_openings(smart_object.entity)
            )
            repository.write(smart_object.entity, updated)
            runtime.smart_objects.update_level_refs(smart_object.entity, level_refs_for_definition(updated))
            mark_dirty_with_dependents(runtime, smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            reconcile_wall_joins(runtime, repository, geometry: geometry, tolerance_mm: 50.0)

            {
              updated_object_ids: [smart_object.id],
              events: [
                { name: 'ParametersChanged', object_ids: [smart_object.id], payload: { constraint_count: updated.constraints.length } },
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          runtime.commands.register(
            'FlipWallOrientation',
            owner_module: 'constructflow.architecture',
            validator: ->(command) { wall_exists_validation_errors(command[:input], runtime, repository) }
          ) do |command|
            input = command[:input]
            smart_object = resolve_wall(input, runtime)
            current = repository.read(smart_object.entity)
            updated = apply_level_constraints(current.flipped_orientation, runtime)
            validate_hosted_openings!(smart_object, updated, repository, geometry)
            geometry.rebuild!(smart_object.entity, updated, openings: repository.host_openings(smart_object.entity))
            repository.write(smart_object.entity, updated)
            runtime.smart_objects.update_level_refs(smart_object.entity, level_refs_for_definition(updated))
            mark_dirty_with_dependents(runtime, smart_object.entity, 'dirty_quantity', 'dirty_drawing')
            reconcile_wall_joins(runtime, repository, geometry: geometry, tolerance_mm: 50.0)
            {
              updated_object_ids: [smart_object.id],
              events: [
                { name: 'ParametersChanged', object_ids: [smart_object.id], payload: { orientation: updated.orientation } },
                { name: 'GeometryChanged', object_ids: [smart_object.id] },
                { name: 'QuantityDirty', object_ids: [smart_object.id] },
                { name: 'DrawingDirty', object_ids: [smart_object.id] }
              ]
            }
          end

          if runtime.respond_to?(:events)
            runtime.events.subscribe('LevelChanged', owner: MANIFEST[:id]) do |event|
              with_reconciliation_transaction(runtime, 'Reconcile level dependents') do
                reconcile_level_dependents(runtime, repository, geometry, event,
                                           caused_by_command_id: event[:caused_by_command_id])
                reconcile_level_surface_dependents(
                  runtime,
                  floor_repository,
                  floor_geometry,
                  room_repository,
                  room_geometry,
                  ceiling_repository,
                  ceiling_geometry,
                  event,
                  caused_by_command_id: event[:caused_by_command_id]
                )
              end
            end
            runtime.events.subscribe('GeometryChanged', owner: MANIFEST[:id]) do |event|
              next unless event[:source_module].to_s == MANIFEST[:id]

              wall_ids = Array(event[:object_ids] || event['object_ids']).filter_map do |object_id|
                object = runtime.smart_objects.fetch_by_id(object_id)
                object.id if object && object.type == 'architecture.wall' && object.owner_module == MANIFEST[:id]
              rescue StandardError
                nil
              end
              with_reconciliation_transaction(runtime, 'Reconcile wall enclosure rooms') do
                reconcile_wall_enclosure_rooms(
                  runtime, repository, room_repository, room_geometry, wall_ids,
                  caused_by_command_id: event[:caused_by_command_id]
                )
              end
            end
          end

          install_ui(runtime)
        end

        def modify_validation_errors(input, runtime, repository, validator)
          smart_object = resolve_wall(input, runtime)
          return ['wall not found'] unless smart_object

          current = repository.read(smart_object.entity)
          return ['wall definition missing'] unless current

          updated = current.with(path_mm: input[:path_mm] || input['path_mm'])
          validate_hosted_openings!(smart_object, updated, repository, nil)
          validator.validate(updated).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def mark_dirty_with_dependents(runtime, entity, *flags)
          manager = runtime.smart_objects
          if manager.respond_to?(:mark_dirty_with_dependents)
            manager.mark_dirty_with_dependents(entity, *flags)
          else
            manager.mark_dirty(entity, *flags)
          end
        end

        def with_reconciliation_transaction(runtime, label)
          commands = runtime.respond_to?(:commands) ? runtime.commands : nil
          transaction_manager = commands && commands.respond_to?(:transaction_manager) ? commands.transaction_manager : nil
          return yield unless transaction_manager

          transaction_manager.run("ConstructFlow: #{label}") { yield }
        end

        # Keep the persisted join graph derived from the current wall paths.
        # This is intentionally a metadata reconciliation step: WallGeometry
        # can consume the stable, symmetric join records without each command
        # having to guess which neighboring walls were affected.
        def reconcile_wall_joins(runtime, repository, geometry: nil, tolerance_mm: 50.0)
          walls = runtime.smart_objects.all
                        .select { |object| object.type == 'architecture.wall' && object.owner_module == MANIFEST[:id] }
                        .sort_by(&:id)
                        .filter_map { |object| [object, repository.read(object.entity)] }
          engine = WallJoinEngine.new
          changed_ids = []

          walls.each do |object, definition|
            joins = walls.filter_map do |other_object, other_definition|
              next if object.id == other_object.id

              join = engine.classify(wall_a: definition, wall_b: other_definition, tolerance_mm: tolerance_mm)
              next if join[:type] == 'none'

              existing = definition.joins.find { |item| item['related_wall_id'].to_s == other_object.id.to_s }
              reverse = other_definition.joins.find { |item| item['related_wall_id'].to_s == object.id.to_s }
              style = existing && existing['allow'] == false ? 'disallow' : (existing && existing['style'])
              style ||= reverse && reverse['allow'] == false ? 'disallow' : (reverse && reverse['style'])
              style ||= join[:style]
              resolved = engine.resolve(wall_a: definition, wall_b: other_definition, style: style, tolerance_mm: tolerance_mm)

              # Find vector pointing away from join point into the other wall
              other_path = other_definition.respond_to?(:centerline_path_mm) ? other_definition.centerline_path_mm : other_definition.path_mm
              j_pt = resolved[:point_mm]
              other_vec = nil
              if other_path && other_path.length >= 2 && j_pt
                d_start = Math.sqrt(((other_path.first[0] - j_pt[0])**2) + ((other_path.first[1] - j_pt[1])**2))
                d_end = Math.sqrt(((other_path.last[0] - j_pt[0])**2) + ((other_path.last[1] - j_pt[1])**2))
                if d_start <= (tolerance_mm * 2.0)
                  other_vec = [other_path[1][0] - other_path[0][0], other_path[1][1] - other_path[0][1], 0.0]
                elsif d_end <= (tolerance_mm * 2.0)
                  other_vec = [other_path[-2][0] - other_path[-1][0], other_path[-2][1] - other_path[-1][1], 0.0]
                end
              end

              {
                'node_index' => nearest_node_index(definition, join[:point_mm]),
                'segment_index' => join[:segment_index],
                'type' => join[:type],
                'style' => resolved[:style],
                'allow' => resolved[:resolved],
                'related_wall_id' => other_object.id.to_s,
                'angle_deg' => resolved[:angle_deg],
                'point_mm' => resolved[:point_mm],
                'other_vector' => other_vec,
                'other_thickness_mm' => other_definition.thickness_mm
              }
            end

            next if joins == definition.joins

            updated = definition.with(joins: joins)
            repository.write(object.entity, updated)
            if geometry && object.entity.respond_to?(:entities)
              openings = repository.host_openings(object.entity) rescue []
              geometry.rebuild!(object.entity, updated, openings: openings) rescue nil
            end
            mark_dirty_with_dependents(runtime, object.entity, 'dirty_drawing')
            changed_ids << object.id
          end
          changed_ids
        end

        def nearest_node_index(definition, point)
          return 0 unless point

          definition.path_mm.each_with_index.min_by do |node, index|
            distance_sq = ((node[0] - point[0])**2) + ((node[1] - point[1])**2) + ((node[2] - point[2])**2)
            [distance_sq, index]
          end.last
        end

        def reconcile_wall_enclosure_rooms(runtime, wall_repository, room_repository, room_geometry, wall_ids,
                                           caused_by_command_id: nil)
          changed_wall_ids = Array(wall_ids).map(&:to_s)
          return [] if changed_wall_ids.empty?

          room_objects = runtime.smart_objects.all.select do |object|
            object.type == 'architecture.room' && object.owner_module == MANIFEST[:id]
          end
          tracked_rooms = room_objects.filter_map do |object|
            definition = room_repository.read(object.entity)
            metadata = definition&.finish_metadata || {}
            next unless metadata['generated_from_walls'] == true
            next if (Array(metadata['source_wall_ids']).map(&:to_s) & changed_wall_ids).empty?

            [object, definition]
          end
          return [] if tracked_rooms.empty?

          all_walls = runtime.smart_objects.all.filter_map do |object|
            next unless object.type == 'architecture.wall' && object.owner_module == MANIFEST[:id]

            definition = wall_repository.read(object.entity)
            definition && [object, definition]
          end
          changed = []
          tracked_rooms.each do |object, definition|
            walls = all_walls.filter_map do |wall_object, wall_definition|
              next if definition.level_id && wall_definition.base_level_id.to_s != definition.level_id.to_s

              wall_definition
            end
            boundaries = RoomEnclosureDetector.new.detect(walls: walls)
            boundary = boundaries.min_by { |candidate| centroid_distance_sq(definition.boundary_mm, candidate) }
            unless boundary
              runtime.smart_objects.update_status(object.entity, 'stale')
              current_meta = runtime.smart_objects.fetch(object.entity).revision_meta
              runtime.smart_objects.update_revision_meta(
                object.entity,
                current_meta.merge('room_enclosure' => 'stale', 'reason' => 'wall enclosure is no longer closed')
              )
              runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing', 'dirty_qa')
              changed << object.id
              next
            end
            if definition.boundary_mm == boundary
              current_object = runtime.smart_objects.fetch(object.entity)
              if current_object.status == 'stale'
                runtime.smart_objects.update_status(object.entity, 'active')
                runtime.smart_objects.update_revision_meta(
                  object.entity,
                  current_object.revision_meta.merge('room_enclosure' => 'current')
                )
              end
              next
            end

            updated = definition.with(boundary_mm: boundary)
            room_geometry.rebuild!(object.entity, updated)
            room_repository.write(object.entity, updated)
            runtime.smart_objects.update_status(object.entity, 'active')
            current_meta = runtime.smart_objects.fetch(object.entity).revision_meta
            runtime.smart_objects.update_revision_meta(object.entity, current_meta.merge('room_enclosure' => 'current'))
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
            changed << object.id
          rescue StandardError => error
            runtime.diagnostics&.warn('wall_enclosure_room_rebuild_failed', error.message, object_id: object.id)
          end
          return changed if changed.empty?

          runtime.events.publish(
            'GeometryChanged',
            { change: 'wall_enclosure_room_reconciled', wall_ids: changed_wall_ids },
            source_module: MANIFEST[:id],
            object_ids: changed,
            caused_by_command_id: caused_by_command_id
          )
          changed
        end

        def centroid_distance_sq(first_boundary, second_boundary)
          first = boundary_centroid(first_boundary)
          second = boundary_centroid(second_boundary)
          ((first[0] - second[0])**2) + ((first[1] - second[1])**2)
        end

        def boundary_centroid(boundary)
          points = Array(boundary)
          return [0.0, 0.0] if points.empty?

          [points.sum { |point| point[0] } / points.length.to_f,
           points.sum { |point| point[1] } / points.length.to_f]
        end

        def validate_hosted_openings!(smart_object, wall_definition, repository, geometry)
          openings = repository.host_openings(smart_object.entity)
          capability = WallHostCapability.new(repository: repository, geometry: geometry)
          issues = openings.flat_map do |opening|
            capability.validate_opening(smart_object, opening, wall_definition: wall_definition)
          end
          raise ArgumentError, "hosted opening reconciliation failed: #{issues.join('; ')}" unless issues.empty?

          openings
        end

        def reconcile_level_dependents(runtime, repository, geometry, event, caused_by_command_id: nil)
          level_ids = level_ids_from_event(event)
          return if level_ids.empty?

          changed = runtime.smart_objects.all.filter_map do |object|
            next unless object.type == 'architecture.wall' && object.owner_module == MANIFEST[:id]

            definition = repository.read(object.entity)
            next unless definition
            next unless level_ids.include?(definition.base_level_id.to_s) || level_ids.include?(definition.top_constraint_level_id.to_s)

            updated = apply_level_constraints(definition, runtime)
            next if updated.path_mm == definition.path_mm && updated.height_mm == definition.height_mm

            validate_hosted_openings!(object, updated, repository, geometry)
            geometry.rebuild!(object.entity, updated, openings: repository.host_openings(object.entity))
            repository.write(object.entity, updated)
            runtime.smart_objects.update_level_refs(object.entity, level_refs_for_definition(updated))
            mark_dirty_with_dependents(runtime, object.entity, 'dirty_quantity', 'dirty_drawing')
            object.id
          rescue StandardError => error
            runtime.diagnostics&.warn('level_dependent_wall_rebuild_failed', error.message, object_id: object.id)
            nil
          end
          return if changed.empty?

          runtime.events.publish(
            'GeometryChanged',
            { change: 'level_constraint_reconciled', level_ids: level_ids },
            source_module: MANIFEST[:id],
            object_ids: changed,
            caused_by_command_id: caused_by_command_id
          )
        end

        def level_ids_from_event(event)
          payload = event[:payload] || event['payload'] || {}
          after = payload[:after] || payload['after'] || {}
          before = payload[:before] || payload['before'] || {}
          values = [
            payload[:level_id], payload['level_id'], after[:id], after['id'], before[:id], before['id']
          ].compact.map(&:to_s).reject(&:empty?)
          values.uniq
        end

        def reconcile_level_surface_dependents(runtime, floor_repository, floor_geometry, room_repository, room_geometry,
                                                ceiling_repository, ceiling_geometry, event, caused_by_command_id: nil)
          level_ids = level_ids_from_event(event)
          return if level_ids.empty?

          changed = []
          runtime.smart_objects.all.each do |object|
            case object.type
            when 'architecture.floor'
              definition = floor_repository.read(object.entity)
              next unless definition && level_ids.include?(definition.level_id.to_s)

              elevation = level_elevation(runtime, definition.level_id) + definition.offset_mm
              updated = definition.with(
                boundary_mm: rebase_points(definition.boundary_mm, elevation),
                holes_mm: definition.holes_mm.map { |loop| rebase_points(loop, elevation) }
              )
              next if updated.boundary_mm == definition.boundary_mm && updated.holes_mm == definition.holes_mm

              floor_geometry.rebuild!(object.entity, updated)
              floor_repository.write(object.entity, updated)
              runtime.smart_objects.update_level_refs(object.entity, floor_level_refs(updated))
              changed << object.id
            when 'architecture.room'
              definition = room_repository.read(object.entity)
              next unless definition && level_ids.include?(definition.level_id.to_s)

              elevation = level_elevation(runtime, definition.level_id)
              updated = definition.with(boundary_mm: rebase_points(definition.boundary_mm, elevation))
              next if updated.boundary_mm == definition.boundary_mm

              room_geometry.rebuild!(object.entity, updated)
              room_repository.write(object.entity, updated)
              runtime.smart_objects.update_level_refs(object.entity, room_level_refs(updated))
              changed << object.id
            when 'architecture.ceiling'
              definition = ceiling_repository.read(object.entity)
              next unless definition && level_ids.include?(definition.level_id.to_s)

              elevation = level_elevation(runtime, definition.level_id) + definition.height_mm + definition.offset_mm
              updated = definition.with(
                boundary_mm: rebase_points(definition.boundary_mm, elevation),
                holes_mm: definition.holes_mm.map { |loop| rebase_points(loop, elevation) }
              )
              next if updated.boundary_mm == definition.boundary_mm && updated.holes_mm == definition.holes_mm

              ceiling_geometry.rebuild!(object.entity, updated)
              ceiling_repository.write(object.entity, updated)
              runtime.smart_objects.update_level_refs(object.entity, ceiling_level_refs(updated))
              changed << object.id
            end
          rescue StandardError => error
            runtime.diagnostics&.warn('level_dependent_architecture_rebuild_failed', error.message, object_id: object.id)
          end
          return if changed.empty?

          changed.each { |object_id| runtime.smart_objects.mark_dirty(runtime.smart_objects.fetch_by_id(object_id).entity, 'dirty_quantity', 'dirty_drawing') }
          runtime.events.publish(
            'GeometryChanged',
            { change: 'level_surface_constraint_reconciled', level_ids: level_ids },
            source_module: MANIFEST[:id],
            object_ids: changed,
            caused_by_command_id: caused_by_command_id
          )
        end

        def rebase_points(points, elevation)
          Array(points).map { |point| [point[0], point[1], elevation] }
        end

        def install_ui(runtime)
          architecture_menu = runtime.menu.add_submenu('Architecture')
          architecture_menu.add_item('Draw Roof Framing') do
            runtime.active_model.select_tool(Tools::RoofFramingTool.new)
          end

          architecture_menu.add_item('Modify Steel Roof Framing') do
            Tools::RoofFramingTool.modify_selected(runtime.active_model)
          end

          architecture_menu.add_item('Draw Structural Grid Framing') do
            runtime.active_model.select_tool(Tools::GridFramingTool.new(runtime: runtime))
          end

          architecture_menu.add_item('Draw Curtain Wall & Lattice') do
            runtime.active_model.select_tool(Tools::CurtainWallTool.new)
          end

          architecture_menu.add_item('Modify Curtain Wall & Lattice') do
            Tools::CurtainWallTool.modify_selected(runtime.active_model)
          end

          architecture_menu.add_item('Revit-Style Auto Roof (Roof by Footprint) [AR]') do
            runtime.active_model.select_tool(Tools::RevitAutoRoofTool.new(runtime: runtime))
          end

          architecture_menu.add_item('Generate Hip/Gable Roof') do
            prompts = ['รูปแบบหลังคา (Form):', 'ความลาดชัน (องศา Deg):', 'ระยะยื่นชายคา (เมตร m):', 'ความสูงไม้เชิงชาย (เมตร m):', 'ความหนาแผ่นมุง (เมตร m):']
            defaults = ['hip', '30.0', '0.80', '0.20', '0.035']
            list = ['hip|gable|lean_to', '', '', '', '']
            input = UI.inputbox(prompts, defaults, list, 'ConstructFlow - สร้างหลังคาปั้นหยา/จั่ว')
            if input
              Architecture::HipGableRoofGenerator.generate_from_selection(
                runtime.active_model,
                form: input[0].to_s,
                slope_deg: input[1].to_f,
                overhang_mm: input[2].to_f,
                fascia_height_mm: input[3].to_f,
                thickness_mm: input[4].to_f
              )
            end
          end

          architecture_menu.add_item('Non-Distort Smart Stretch (9-Slice) [SS]') do
            runtime.active_model.select_tool(Tools::SmartStretchTool.new(runtime: runtime))
          end

          architecture_menu.add_item('Stretch by Target Area') do
            runtime.active_model.select_tool(Tools::StretchByAreaTool.new)
          end

          architecture_menu.add_item('Save Selected Face as Profile') do
            face = runtime.active_model.selection.find { |e| e.is_a?(Sketchup::Face) }
            unless face
              UI.messagebox('กรุณาเลือก Face หน้าตัด 2D ก่อนบันทึกเป็นโปรไฟล์')
              next
            end
            prompts = ['ชื่อหน้าตัดโปรไฟล์ (Profile Name):', 'รหัสโปรไฟล์ (Profile Code):', 'จุดยึด (Anchor Point):']
            defaults = ['บัวผนังที่วาดใหม่', 'CUST-01', 'bottom_left']
            list = ['', '', 'bottom_left|bottom_center|bottom_right|center|top_left|top_center|top_right']
            results = UI.inputbox(prompts, defaults, list, 'บันทึกหน้าตัดโปรไฟล์ [Custom Profile]')
            if results
              name = results[0]
              code = results[1]
              anchor = results[2].to_sym
              extracted = Core::CustomProfileStore.extract_profile_from_face(face, anchor: anchor)
              if extracted
                Core::CustomProfileStore.add_profile(code, name, extracted[:points_mm], extracted[:width_mm], extracted[:depth_mm])
                UI.messagebox("บันทึกหน้าตัดโปรไฟล์ '#{name}' (#{code}) สำเร็จ!\nขนาด: #{extracted[:width_mm]} x #{extracted[:depth_mm]} mm")
              else
                UI.messagebox('ไม่สามารถสกัดจุดหน้าตัดจาก Face ที่เลือกได้')
              end
            end
          end

          architecture_menu.add_item('Sweep Profile Along Selected Edges') do
            edges = runtime.active_model.selection.select { |e| e.is_a?(Sketchup::Edge) }
            if edges.empty?
              UI.messagebox('กรุณาเลือกเส้น (Edges/Curve) ที่ต้องการกวาดบัว/โปรไฟล์ตามแนวเส้น')
              next
            end
            all_profiles = Core::StructuralProfileCatalog::PROFILES.keys
            prompts = ['เลือกโปรไฟล์ (Profile Code):']
            defaults = ['SKIRT-100x15']
            list = [all_profiles.join('|')]
            results = UI.inputbox(prompts, defaults, list, 'กวาดบัวตามแนวเส้นที่เลือก [Sweep Along Edges]')
            if results
              code = results[0]
              res = Core::CustomProfileStore.sweep_along_edges(edges, code, runtime.active_model)
              if res
                UI.messagebox("กวาดโปรไฟล์ #{code} ตามแนวเส้นสำเร็จ!")
              else
                UI.messagebox('ไม่สามารถสร้างแนวบัวตามเส้นที่เลือกได้')
              end
            end
          end





          architecture_menu.add_item('Draw Staircase') do
            runtime.active_model.select_tool(Tools::StairTool.new)
          end

          architecture_menu.add_item('Draw Smart Wall') do
            values = UI.inputbox(
              ['Thickness (mm)', 'Height (mm)', 'Base level ID (optional)'],
              ['100', '2800', ''],
              'ConstructFlow Smart Wall'
            )
            next unless values

            thickness = Float(values[0])
            height = Float(values[1])
            level_id = values[2].to_s
            runtime.active_model.select_tool(
              Tools::WallTool.new(
                runtime: runtime,
                thickness_mm: thickness,
                height_mm: height,
                level_id: level_id
              )
            )
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end
          architecture_menu.add_item('Open Architecture Plan Editor') do
            values = UI.inputbox(
              ['Base level ID (optional)'],
              [''],
              'ConstructFlow Architecture Plan'
            )
            next unless values

            level_id = values[0].to_s.strip
            runtime.plan_scenes.refresh_preset('architecture.construction') if runtime.respond_to?(:plan_scenes)
            runtime.active_model.select_tool(Tools::WallTool.new(
              runtime: runtime,
              thickness_mm: WallDefinition::DEFAULT_THICKNESS_MM,
              height_mm: WallDefinition::DEFAULT_HEIGHT_MM,
              level_id: level_id
            ))
          rescue StandardError => error
            UI.messagebox("ConstructFlow Architecture Plan error: #{error.message}")
          end
          architecture_menu.add_item('Draw Architectural Floor in Plan') do
            values = UI.inputbox(
              ['Thickness (mm)', 'Base level ID (optional)'],
              ['150', ''],
              'ConstructFlow Architectural Floor'
            )
            next unless values

            runtime.active_model.select_tool(
              Tools::FloorTool.new(
                runtime: runtime,
                thickness_mm: Float(values[0]),
                level_id: values[1]
              )
            )
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end
          architecture_menu.add_item('Draw Room in Plan') do
            values = UI.inputbox(
              ['Room name', 'Room number', 'Program', 'Base level ID (optional)'],
              ['', '', 'generic', ''],
              'ConstructFlow Room'
            )
            next unless values

            runtime.active_model.select_tool(
              Tools::RoomTool.new(
                runtime: runtime,
                name: values[0], number: values[1], program: values[2], level_id: values[3]
              )
            )
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end
          architecture_menu.add_item('Detect Rooms from Smart Walls') do
            values = UI.inputbox(
              ['Room name prefix', 'Program', 'Base level ID (optional)'],
              ['Room', 'generic', ''],
              'ConstructFlow Room Detection'
            )
            next unless values

            result = runtime.commands.execute(
              'DetectRoomsFromWalls',
              { name_prefix: values[0], program: values[1], level_id: values[2] },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:warnings].join("\n")) unless result[:warnings].empty?
            runtime.plan_scenes.refresh_preset('architecture.construction') if result[:status] == 'success' && runtime.respond_to?(:plan_scenes)
          rescue StandardError => error
            UI.messagebox("ConstructFlow Room detection error: #{error.message}")
          end
          architecture_menu.add_item('Draw Ceiling in Plan') do
            values = UI.inputbox(
              ['Height above base level (mm)', 'Thickness (mm)', 'Base level ID (optional)'],
              ['2700', '12', ''],
              'ConstructFlow Architectural Ceiling'
            )
            next unless values

            runtime.active_model.select_tool(
              Tools::CeilingTool.new(
                runtime: runtime, height_mm: Float(values[0]), thickness_mm: Float(values[1]), level_id: values[2]
              )
            )
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end
          architecture_menu.add_item('Edit Floor Boundary in Plan') do
            values = UI.inputbox(['Base level ID (optional)'], [''], 'ConstructFlow Floor Boundary Edit')
            next unless values

            runtime.plan_scenes.refresh_preset('architecture.construction') if runtime.respond_to?(:plan_scenes)
            runtime.active_model.select_tool(Tools::BoundaryEditTool.new(
              runtime: runtime, object_type: 'architecture.floor', repository: FloorRepository.new,
              command: 'ModifyFloorBoundary', label: 'Floor', level_id: values[0]
            ))
          rescue StandardError => error
            UI.messagebox("ConstructFlow Floor edit error: #{error.message}")
          end
          architecture_menu.add_item('Edit Room Boundary in Plan') do
            values = UI.inputbox(['Base level ID (optional)'], [''], 'ConstructFlow Room Boundary Edit')
            next unless values

            runtime.plan_scenes.refresh_preset('architecture.construction') if runtime.respond_to?(:plan_scenes)
            runtime.active_model.select_tool(Tools::BoundaryEditTool.new(
              runtime: runtime, object_type: 'architecture.room', repository: RoomRepository.new,
              command: 'ModifyRoomBoundary', label: 'Room', level_id: values[0]
            ))
          rescue StandardError => error
            UI.messagebox("ConstructFlow Room edit error: #{error.message}")
          end
          architecture_menu.add_item('Edit Ceiling Boundary in Plan') do
            values = UI.inputbox(['Base level ID (optional)'], [''], 'ConstructFlow Ceiling Boundary Edit')
            next unless values

            runtime.plan_scenes.refresh_preset('architecture.construction') if runtime.respond_to?(:plan_scenes)
            runtime.active_model.select_tool(Tools::BoundaryEditTool.new(
              runtime: runtime, object_type: 'architecture.ceiling', repository: CeilingRepository.new,
              command: 'ModifyCeilingBoundary', label: 'Ceiling', level_id: values[0]
            ))
          rescue StandardError => error
            UI.messagebox("ConstructFlow Ceiling edit error: #{error.message}")
          end
          architecture_menu.add_item('Edit Smart Wall in Plan') do
            values = UI.inputbox(
              ['Base level ID (optional)'],
              [''],
              'ConstructFlow Smart Wall Edit'
            )
            next unless values

            runtime.plan_scenes.refresh_preset('architecture.construction') if runtime.respond_to?(:plan_scenes)
            runtime.active_model.select_tool(Tools::WallEditTool.new(runtime: runtime, level_id: values[0]))
          rescue StandardError => error
            UI.messagebox("ConstructFlow Architecture Plan error: #{error.message}")
          end
          architecture_menu.add_item('Copy Smart Wall in Plan') do
            values = UI.inputbox(
              ['Base level ID (optional)'],
              [''],
              'ConstructFlow Smart Wall Copy'
            )
            next unless values

            runtime.plan_scenes.refresh_preset('architecture.construction') if runtime.respond_to?(:plan_scenes)
            runtime.active_model.select_tool(Tools::WallEditTool.new(runtime: runtime, copy: true, level_id: values[0]))
          rescue StandardError => error
            UI.messagebox("ConstructFlow Architecture Plan copy error: #{error.message}")
          end
        end
      end
    end
  end
end
