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
          objects: %w[structure.column structure.foundation structure.rebar_set],
          commands: %w[CreateColumn GenerateFoundation AssignRebarSet ModifyRebarSet],
          events: %w[StructuralMemberCreated FoundationGenerated RebarSetAssigned RebarSetChanged GeometryChanged QuantityDirty DrawingDirty ValidationStateChanged],
          providers: ['constructflow.structure.quantity'],
          validators: %w[structure.column.validity structure.foundation.validity structure.rebar.validity]
        }.freeze

        module_function

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
          register_generate_foundation(runtime, repository, geometry, validator)
          register_assign_rebar(runtime, repository, geometry, validator, coordination)
          register_modify_rebar(runtime, repository, geometry, validator, coordination)
          install_ui(runtime)
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
            engineering_status: input[:engineering_status] || input['engineering_status'] || 'preliminary'
          )
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
