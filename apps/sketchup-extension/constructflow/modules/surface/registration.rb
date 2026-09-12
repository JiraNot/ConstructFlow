# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      module Registration
        MANIFEST = {
          id: 'constructflow.surface',
          name: 'Surface & Paving',
          version: '0.1.0',
          schema_version: 1,
          requires: ['constructflow.core'],
          optional_capabilities: %w[drainage.network structure.coordination],
          provides: %w[surface.boundary surface.quantity],
          objects: %w[surface.boundary surface.border surface.pattern surface.parking_layout],
          commands: %w[CreateSurfaceBoundary ModifySurfaceBoundary AddPavingBorder SetPavingPattern SetPavingOrigin SetPavingDirection CreateParkingLayout LockPavingLayout],
          events: %w[SurfaceCreated SurfaceChanged BorderAdded PatternChanged ParkingLayoutCreated LayoutLocked GeometryChanged QuantityDirty DrawingDirty ValidationStateChanged],
          providers: ['constructflow.surface.quantity'],
          validators: %w[surface.boundary.validity surface.pattern.validity surface.border.validity surface.parking.validity]
        }.freeze

        module_function

        def install(runtime)
          return if runtime.modules.registered?('constructflow.surface')

          runtime.module_loader.load(MANIFEST)
          repository = Repository.new
          geometry = Geometry.new
          validator = Validators::SurfaceValidator.new
          quantity_provider = Quantity::SurfaceQuantityProvider.new

          runtime.capabilities.register('surface.boundary', owner_module: 'constructflow.surface', provider: repository)
          runtime.capabilities.register('surface.quantity', owner_module: 'constructflow.surface', provider: quantity_provider)

          register_create_surface(runtime, repository, geometry, validator)
          register_modify_surface(runtime, repository, geometry, validator)
          register_add_border(runtime, repository, geometry, validator)
          register_set_pattern(runtime, repository, geometry, validator)
          register_pattern_control(runtime, repository, geometry, validator, 'SetPavingOrigin', :origin)
          register_pattern_control(runtime, repository, geometry, validator, 'SetPavingDirection', :direction)
          register_lock_pattern(runtime, repository, geometry, validator)
          register_parking(runtime, repository, geometry, validator)
          install_ui(runtime)
        end

        def register_create_surface(runtime, repository, geometry, validator)
          runtime.commands.register(
            'CreateSurfaceBoundary',
            owner_module: 'constructflow.surface',
            validator: ->(command) { surface_validation_errors(command[:input], runtime, validator) }
          ) do |command|
            input = command[:input]
            definition = surface_definition_from_input(input, runtime)
            group = geometry.create_surface_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group,
              type: 'surface.boundary',
              owner_module: 'constructflow.surface',
              display_name: input[:display_name] || input['display_name'] || 'Surface',
              created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
              level_refs: surface_level_refs(definition),
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            repository.write_surface(group, definition)
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: [object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'surface.boundary' } },
                { name: 'SurfaceCreated', object_ids: [object.id], payload: { surface_type: definition.surface_type } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end
        end

        def register_modify_surface(runtime, repository, geometry, validator)
          runtime.commands.register(
            'ModifySurfaceBoundary',
            owner_module: 'constructflow.surface',
            validator: ->(command) { modify_surface_validation_errors(command[:input], runtime, repository, validator) }
          ) do |command|
            input = command[:input]
            object = resolve_surface(input, runtime)
            current = repository.read_surface(object.entity)
            updated = current.with(
              outer_boundary_mm: value_or(input, :outer_boundary_mm, current.outer_boundary_mm),
              holes_mm: value_or(input, :holes_mm, current.holes_mm)
            )
            geometry.rebuild_surface!(object.entity, updated)
            repository.write_surface(object.entity, updated)
            dependents = reconcile_surface_dependents(runtime, repository, geometry, object, updated)
            runtime.smart_objects.mark_dirty_with_dependents(
              object.entity, 'dirty_quantity', 'dirty_drawing', 'dirty_layout'
            )
            affected = [object.id, *dependents].uniq
            {
              updated_object_ids: affected,
              events: [
                { name: 'SurfaceChanged', object_ids: affected, payload: { change: 'boundary', dependents: dependents } },
                { name: 'GeometryChanged', object_ids: affected },
                { name: 'QuantityDirty', object_ids: affected },
                { name: 'DrawingDirty', object_ids: affected }
              ]
            }
          end
        end

        def register_add_border(runtime, repository, geometry, validator)
          runtime.commands.register(
            'AddPavingBorder',
            owner_module: 'constructflow.surface',
            validator: ->(command) { border_validation_errors(command[:input], runtime, repository, validator) }
          ) do |command|
            input = command[:input]
            surface = resolve_surface(input, runtime)
            surface_definition = repository.read_surface(surface.entity)
            definition = border_definition_from_input(input, surface)
            group = geometry.create_border_group(
              runtime.active_model,
              surface_definition: surface_definition,
              border_definition: definition
            )
            border = runtime.smart_objects.create(
              entity: group,
              type: 'surface.border',
              owner_module: 'constructflow.surface',
              display_name: input[:display_name] || input['display_name'] || 'Paving Border',
              created_phase: surface.created_phase,
              source_state: surface.source_state
            )
            repository.write_border(group, definition)
            runtime.smart_objects.add_relationship(group, kind: 'host', target_id: surface.id, role: 'surface_border')
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(surface.entity, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: [border.id],
              updated_object_ids: [surface.id],
              events: [
                { name: 'BorderAdded', object_ids: [border.id, surface.id], payload: { width_mm: definition.width_mm } },
                { name: 'RelationshipChanged', object_ids: [border.id, surface.id], payload: { kind: 'host' } },
                { name: 'QuantityDirty', object_ids: [border.id, surface.id] },
                { name: 'DrawingDirty', object_ids: [border.id, surface.id] }
              ]
            }
          end
        end

        def register_set_pattern(runtime, repository, geometry, validator)
          runtime.commands.register(
            'SetPavingPattern',
            owner_module: 'constructflow.surface',
            validator: ->(command) { pattern_validation_errors(command[:input], runtime, repository, validator) }
          ) do |command|
            input = command[:input]
            pattern_object = resolve_pattern(input, runtime)
            if pattern_object
              current = repository.read_pattern(pattern_object.entity)
              surface = runtime.smart_objects.fetch_by_id(current.surface_object_id)
              surface_definition = repository.read_surface(surface.entity)
              updated = current.with(
                pattern: value_or(input, :pattern, current.pattern),
                origin_mm: value_or(input, :origin_mm, current.origin_mm),
                angle_deg: value_or(input, :angle_deg, current.angle_deg),
                module_mm: value_or(input, :module_mm, current.module_mm),
                joint_mm: value_or(input, :joint_mm, current.joint_mm),
                minimum_cut_mm: value_or(input, :minimum_cut_mm, current.minimum_cut_mm),
                layout_state: 'preview'
              )
              geometry.rebuild_pattern!(pattern_object.entity, surface_definition: surface_definition, pattern_definition: updated)
              repository.write_pattern(pattern_object.entity, updated)
              runtime.smart_objects.mark_dirty(pattern_object.entity, 'dirty_quantity', 'dirty_drawing')
              result = { object: pattern_object, surface: surface, definition: updated, created: false }
            else
              surface = resolve_surface(input, runtime)
              surface_definition = repository.read_surface(surface.entity)
              definition = pattern_definition_from_input(input, surface, surface_definition)
              group = geometry.create_pattern_group(
                runtime.active_model,
                surface_definition: surface_definition,
                pattern_definition: definition
              )
              pattern_object = runtime.smart_objects.create(
                entity: group,
                type: 'surface.pattern',
                owner_module: 'constructflow.surface',
                display_name: input[:display_name] || input['display_name'] || 'Paving Pattern',
                created_phase: surface.created_phase,
                source_state: surface.source_state
              )
              repository.write_pattern(group, definition)
              runtime.smart_objects.add_relationship(group, kind: 'host', target_id: surface.id, role: 'surface_pattern')
              result = { object: pattern_object, surface: surface, definition: definition, created: true }
            end
            runtime.smart_objects.mark_dirty(result[:surface].entity, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: result[:created] ? [result[:object].id] : [],
              updated_object_ids: [result[:object].id, result[:surface].id],
              events: [
                { name: 'PatternChanged', object_ids: [result[:object].id, result[:surface].id], payload: { pattern: result[:definition].pattern } },
                { name: 'GeometryChanged', object_ids: [result[:object].id] },
                { name: 'QuantityDirty', object_ids: [result[:object].id, result[:surface].id] },
                { name: 'DrawingDirty', object_ids: [result[:object].id, result[:surface].id] }
              ]
            }
          end
        end

        def register_pattern_control(runtime, repository, geometry, validator, command_name, control)
          runtime.commands.register(
            command_name,
            owner_module: 'constructflow.surface',
            validator: ->(command) { existing_pattern_validation_errors(command[:input], runtime, repository, validator, control) }
          ) do |command|
            input = command[:input]
            pattern_object = resolve_pattern(input, runtime)
            current = repository.read_pattern(pattern_object.entity)
            surface = runtime.smart_objects.fetch_by_id(current.surface_object_id)
            surface_definition = repository.read_surface(surface.entity)
            updated = if control == :origin
                        current.with(origin_mm: input[:origin_mm] || input['origin_mm'], layout_state: 'preview')
                      else
                        current.with(angle_deg: input[:angle_deg] || input['angle_deg'], layout_state: 'preview')
                      end
            geometry.rebuild_pattern!(pattern_object.entity, surface_definition: surface_definition, pattern_definition: updated)
            repository.write_pattern(pattern_object.entity, updated)
            runtime.smart_objects.mark_dirty(pattern_object.entity, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(surface.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [pattern_object.id, surface.id],
              events: [
                { name: 'PatternChanged', object_ids: [pattern_object.id, surface.id], payload: { change: control.to_s } },
                { name: 'GeometryChanged', object_ids: [pattern_object.id] },
                { name: 'QuantityDirty', object_ids: [pattern_object.id, surface.id] },
                { name: 'DrawingDirty', object_ids: [pattern_object.id, surface.id] }
              ]
            }
          end
        end

        def register_lock_pattern(runtime, repository, geometry, validator)
          runtime.commands.register(
            'LockPavingLayout',
            owner_module: 'constructflow.surface',
            validator: ->(command) { existing_pattern_validation_errors(command[:input], runtime, repository, validator, :lock) }
          ) do |command|
            pattern_object = resolve_pattern(command[:input], runtime)
            current = repository.read_pattern(pattern_object.entity)
            surface = runtime.smart_objects.fetch_by_id(current.surface_object_id)
            surface_definition = repository.read_surface(surface.entity)
            updated = current.with(layout_state: 'locked')
            geometry.rebuild_pattern!(pattern_object.entity, surface_definition: surface_definition, pattern_definition: updated)
            repository.write_pattern(pattern_object.entity, updated)
            runtime.smart_objects.mark_dirty(pattern_object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [pattern_object.id, surface.id],
              events: [
                { name: 'LayoutLocked', object_ids: [pattern_object.id, surface.id] },
                { name: 'QuantityDirty', object_ids: [pattern_object.id, surface.id] },
                { name: 'DrawingDirty', object_ids: [pattern_object.id, surface.id] }
              ]
            }
          end
        end

        def register_parking(runtime, repository, geometry, validator)
          runtime.commands.register(
            'CreateParkingLayout',
            owner_module: 'constructflow.surface',
            validator: ->(command) { parking_validation_errors(command[:input], runtime, repository, validator) }
          ) do |command|
            input = command[:input]
            surface = resolve_surface(input, runtime)
            surface_definition = repository.read_surface(surface.entity)
            definition = parking_definition_from_input(input, surface, surface_definition)
            group = geometry.create_parking_group(runtime.active_model, definition)
            parking = runtime.smart_objects.create(
              entity: group,
              type: 'surface.parking_layout',
              owner_module: 'constructflow.surface',
              display_name: input[:display_name] || input['display_name'] || "#{definition.bay_count}-Bay Parking Layout",
              created_phase: surface.created_phase,
              source_state: surface.source_state
            )
            repository.write_parking(group, definition)
            runtime.smart_objects.add_relationship(group, kind: 'host', target_id: surface.id, role: 'parking_layout')
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
            runtime.smart_objects.mark_dirty(surface.entity, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: [parking.id],
              updated_object_ids: [surface.id],
              events: [
                { name: 'ParkingLayoutCreated', object_ids: [parking.id, surface.id], payload: { bay_count: definition.bay_count } },
                { name: 'RelationshipChanged', object_ids: [parking.id, surface.id], payload: { kind: 'host' } },
                { name: 'GeometryChanged', object_ids: [parking.id] },
                { name: 'QuantityDirty', object_ids: [parking.id, surface.id] },
                { name: 'DrawingDirty', object_ids: [parking.id, surface.id] }
              ]
            }
          end
        end

        def reconcile_surface_dependents(runtime, repository, geometry, surface_object, surface_definition)
          runtime.smart_objects.all.filter_map do |dependent|
            relationship = Array(dependent.relationships).find do |item|
              item['kind'].to_s == 'host' && item['target_id'].to_s == surface_object.id.to_s
            end
            next unless relationship

            case dependent.type.to_s
            when 'surface.pattern'
              pattern = repository.read_pattern(dependent.entity)
              next unless pattern

              preview = pattern.with(layout_state: 'preview')
              geometry.rebuild_pattern!(dependent.entity, surface_definition: surface_definition, pattern_definition: preview)
              repository.write_pattern(dependent.entity, preview)
              repository.clear_layout(dependent.entity)
            when 'surface.border'
              border = repository.read_border(dependent.entity)
              next unless border

              geometry.rebuild_border!(
                dependent.entity,
                surface_definition: surface_definition,
                border_definition: border
              )
            when 'surface.parking_layout'
              # Parking geometry is intentionally kept as authored layout; its
              # dependency is still invalidated for explicit regeneration.
              next
            else
              next
            end
            runtime.smart_objects.mark_dirty(dependent.entity, 'dirty_quantity', 'dirty_drawing', 'dirty_layout')
            dependent.id
          rescue StandardError => error
            runtime.diagnostics&.warn(
              'surface_dependent_rebuild_failed', error.message, object_id: dependent.id,
              surface_object_id: surface_object.id
            )
            runtime.smart_objects.mark_dirty(dependent.entity, 'dirty_quantity', 'dirty_drawing', 'dirty_layout')
            dependent.id
          end
        end

        def surface_definition_from_input(input, runtime)
          level_id = input[:base_level_id] || input['base_level_id']
          elevation = if level_id && !level_id.to_s.empty?
                        level = runtime.levels.fetch(level_id)
                        raise ArgumentError, "level #{level_id} has unknown elevation" if level.elevation_mm.nil?
                        level.elevation_mm + Float(input[:base_offset_mm] || input['base_offset_mm'] || 0)
                      else
                        Float(input[:base_elevation_mm] || input['base_elevation_mm'] || 0)
                      end
          outer = Array(input[:outer_boundary_mm] || input['outer_boundary_mm']).map(&:dup)
          holes = Array(input[:holes_mm] || input['holes_mm']).map { |loop| Array(loop).map(&:dup) }
          outer.each { |point| point[2] = elevation }
          holes.each { |loop| loop.each { |point| point[2] = elevation } }
          SurfaceDefinition.new(
            outer_boundary_mm: outer,
            holes_mm: holes,
            surface_type: input[:surface_type] || input['surface_type'] || 'generic',
            base_level_id: level_id,
            base_elevation_mm: elevation,
            assembly_id: input[:assembly_id] || input['assembly_id'],
            drain_target_id: input[:drain_target_id] || input['drain_target_id']
          )
        end

        def pattern_definition_from_input(input, surface, surface_definition)
          PatternDefinition.new(
            surface_object_id: surface.id,
            pattern: input[:pattern] || input['pattern'] || 'grid',
            origin_mm: input[:origin_mm] || input['origin_mm'] || surface_definition.center_mm,
            angle_deg: input[:angle_deg] || input['angle_deg'] || 0,
            module_mm: input[:module_mm] || input['module_mm'] || [300, 300],
            joint_mm: input[:joint_mm] || input['joint_mm'] || 3,
            minimum_cut_mm: input[:minimum_cut_mm] || input['minimum_cut_mm'] || 50,
            alignment: input[:alignment] || input['alignment'] || 'custom'
          )
        end

        def border_definition_from_input(input, surface)
          BorderDefinition.new(
            surface_object_id: surface.id,
            width_mm: input[:width_mm] || input['width_mm'] || 150,
            material_id: input[:material_id] || input['material_id'] || 'generic.border',
            offset_mode: input[:offset_mode] || input['offset_mode'] || 'inside',
            corner_treatment: input[:corner_treatment] || input['corner_treatment'] || 'miter',
            order: input[:order] || input['order'] || 0,
            follow_holes: input.key?(:follow_holes) ? input[:follow_holes] : (input['follow_holes'] || false)
          )
        end

        def parking_definition_from_input(input, surface, surface_definition)
          ParkingLayoutDefinition.new(
            surface_object_id: surface.id,
            origin_mm: input[:origin_mm] || input['origin_mm'] || surface_definition.outer_boundary_mm.first,
            bay_count: input[:bay_count] || input['bay_count'] || 3,
            bay_width_mm: input[:bay_width_mm] || input['bay_width_mm'] || 2500,
            bay_length_mm: input[:bay_length_mm] || input['bay_length_mm'] || 5000,
            angle_deg: input[:angle_deg] || input['angle_deg'] || 0,
            divider_width_mm: input[:divider_width_mm] || input['divider_width_mm'] || 100,
            outer_border_width_mm: input[:outer_border_width_mm] || input['outer_border_width_mm'] || 150
          )
        end

        def surface_validation_errors(input, runtime, validator)
          validator.validate_surface(surface_definition_from_input(input, runtime)).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def modify_surface_validation_errors(input, runtime, repository, validator)
          object = resolve_surface(input, runtime)
          return ['surface not found'] unless object
          current = repository.read_surface(object.entity)
          updated = current.with(
            outer_boundary_mm: value_or(input, :outer_boundary_mm, current.outer_boundary_mm),
            holes_mm: value_or(input, :holes_mm, current.holes_mm)
          )
          validator.validate_surface(updated).map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def border_validation_errors(input, runtime, repository, validator)
          surface = resolve_surface(input, runtime)
          return ['surface not found'] unless surface
          surface_definition = repository.read_surface(surface.entity)
          validator.validate_border(border_definition_from_input(input, surface), surface_definition: surface_definition)
                   .select { |issue| issue[:severity] == 'error' }.map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def pattern_validation_errors(input, runtime, repository, validator)
          pattern_object = resolve_pattern(input, runtime)
          if pattern_object
            current = repository.read_pattern(pattern_object.entity)
            surface = runtime.smart_objects.fetch_by_id(current.surface_object_id)
            definition = current.with(
              pattern: value_or(input, :pattern, current.pattern),
              origin_mm: value_or(input, :origin_mm, current.origin_mm),
              angle_deg: value_or(input, :angle_deg, current.angle_deg),
              module_mm: value_or(input, :module_mm, current.module_mm),
              joint_mm: value_or(input, :joint_mm, current.joint_mm),
              minimum_cut_mm: value_or(input, :minimum_cut_mm, current.minimum_cut_mm)
            )
          else
            surface = resolve_surface(input, runtime)
            return ['surface not found'] unless surface
            definition = pattern_definition_from_input(input, surface, repository.read_surface(surface.entity))
          end
          validator.validate_pattern(definition, surface_definition: repository.read_surface(surface.entity))
                   .select { |issue| issue[:severity] == 'error' }.map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def existing_pattern_validation_errors(input, runtime, repository, validator, control)
          pattern = resolve_pattern(input, runtime)
          return ['paving pattern not found'] unless pattern
          current = repository.read_pattern(pattern.entity)
          surface = runtime.smart_objects.fetch_by_id(current.surface_object_id)
          updated = case control
                    when :origin then current.with(origin_mm: input[:origin_mm] || input['origin_mm'])
                    when :direction then current.with(angle_deg: input[:angle_deg] || input['angle_deg'])
                    else current.with(layout_state: 'locked')
                    end
          validator.validate_pattern(updated, surface_definition: repository.read_surface(surface.entity))
                   .select { |issue| issue[:severity] == 'error' }.map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def parking_validation_errors(input, runtime, repository, validator)
          surface = resolve_surface(input, runtime)
          return ['surface not found'] unless surface
          surface_definition = repository.read_surface(surface.entity)
          validator.validate_parking(parking_definition_from_input(input, surface, surface_definition), surface_definition: surface_definition)
                   .select { |issue| issue[:severity] == 'error' }.map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def surface_level_refs(definition)
          return [] if definition.base_level_id.nil? || definition.base_level_id.empty?
          [{ role: 'base', level_id: definition.base_level_id, offset_mm: 0 }]
        end

        def resolve_surface(input, runtime)
          entity = input[:surface_entity] || input['surface_entity'] || input[:entity] || input['entity']
          object_id = input[:surface_object_id] || input['surface_object_id'] || input[:object_id] || input['object_id']
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(object_id)
          return nil unless object && object.owner_module == 'constructflow.surface' && object.type == 'surface.boundary'
          object
        end

        def resolve_pattern(input, runtime)
          entity = input[:pattern_entity] || input['pattern_entity']
          object_id = input[:pattern_object_id] || input['pattern_object_id']
          return nil if entity.nil? && (object_id.nil? || object_id.to_s.empty?)
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(object_id)
          return nil unless object && object.owner_module == 'constructflow.surface' && object.type == 'surface.pattern'
          object
        end

        def value_or(input, key, default)
          return input[key] if input.key?(key)
          string_key = key.to_s
          return input[string_key] if input.key?(string_key)
          default
        end

        def install_ui(runtime)
          menu = runtime.menu.add_submenu('Surface & Paving')
          menu.add_item('Draw Surface Boundary in Plan') do
            values = UI.inputbox(['Surface type', 'Base level ID (optional)'], ['paver', ''], 'ConstructFlow Plan Surface')
            next unless values

            runtime.active_model.select_tool(
              Tools::BoundaryTool.new(runtime: runtime, surface_type: values[0], base_level_id: values[1])
            )
          rescue ArgumentError => error
            UI.messagebox(error.message)
          end
          menu.add_item('Create Surface from Selected Face') do
            face = runtime.active_model.selection.find { |entity| entity.is_a?(Sketchup::Face) }
            unless face
              UI.messagebox('Select one SketchUp face first.')
              next
            end
            values = UI.inputbox(['Surface type'], ['paver'], 'ConstructFlow Surface')
            next unless values
            outer = face.outer_loop.vertices.map { |vertex| Core::Units.point_to_mm(vertex.position) }
            holes = face.loops.reject(&:outer?).map { |loop| loop.vertices.map { |vertex| Core::Units.point_to_mm(vertex.position) } }
            result = runtime.commands.execute(
              'CreateSurfaceBoundary',
              { outer_boundary_mm: outer, holes_mm: holes, surface_type: values[0].to_s },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
          rescue StandardError => error
            UI.messagebox("ConstructFlow Surface error: #{error.message}")
          end

          menu.add_item('Add Border to Selected Surface') do
            surface = selected_surface(runtime)
            unless surface
              UI.messagebox('Select one ConstructFlow Surface first.')
              next
            end
            values = UI.inputbox(['Width (mm)', 'Material ID'], ['150', 'generic.border'], 'ConstructFlow Paving Border')
            next unless values
            result = runtime.commands.execute(
              'AddPavingBorder',
              { surface_object_id: surface.id, width_mm: Float(values[0]), material_id: values[1].to_s },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
          end

          menu.add_item('Set Pattern on Selected Surface') do
            surface = selected_surface(runtime)
            unless surface
              UI.messagebox('Select one ConstructFlow Surface first.')
              next
            end
            values = UI.inputbox(
              ['Pattern', 'Module width (mm)', 'Module height (mm)', 'Joint (mm)', 'Angle (deg)'],
              ['grid', '300', '300', '3', '0'],
              'ConstructFlow Paving Pattern'
            )
            next unless values
            result = runtime.commands.execute(
              'SetPavingPattern',
              {
                surface_object_id: surface.id,
                pattern: values[0].to_s,
                module_mm: [Float(values[1]), Float(values[2])],
                joint_mm: Float(values[3]),
                angle_deg: Float(values[4])
              },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
          end

          menu.add_item('Create Parking Layout on Selected Surface') do
            surface = selected_surface(runtime)
            unless surface
              UI.messagebox('Select one ConstructFlow Surface first.')
              next
            end
            values = UI.inputbox(
              ['Bay count', 'Bay width (mm)', 'Bay length (mm)', 'Divider width (mm)', 'Angle (deg)'],
              ['3', '2500', '5000', '100', '0'],
              'ConstructFlow Parking Layout'
            )
            next unless values
            result = runtime.commands.execute(
              'CreateParkingLayout',
              {
                surface_object_id: surface.id,
                bay_count: Integer(values[0]),
                bay_width_mm: Float(values[1]),
                bay_length_mm: Float(values[2]),
                divider_width_mm: Float(values[3]),
                angle_deg: Float(values[4])
              },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
          end
        end

        def selected_surface(runtime)
          runtime.active_model.selection.filter_map { |entity| runtime.smart_objects.fetch(entity) }
                 .find { |object| object.owner_module == 'constructflow.surface' && object.type == 'surface.boundary' }
        end
      end
    end
  end
end
