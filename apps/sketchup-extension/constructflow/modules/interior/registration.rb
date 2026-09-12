# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      module Registration
        MANIFEST = {
          id: 'constructflow.interior',
          name: 'Interior & Joinery',
          version: '0.1.0',
          schema_version: 1,
          requires: ['constructflow.core'],
          optional_capabilities: %w[architecture.wall_host plumbing.network drainage.network electrical.network],
          provides: %w[interior.joinery interior.quantity],
          objects: %w[interior.cabinet_run],
          commands: %w[CreateCabinetRun SplitCabinetModule AssignCabinetFront AddDrawerSet GenerateJoineryParts],
          events: %w[CabinetRunCreated CabinetModulesChanged CabinetFrontChanged DrawerSetChanged JoineryPartsGenerated GeometryChanged QuantityDirty DrawingDirty ValidationStateChanged],
          providers: ['constructflow.interior.quantity'],
          validators: %w[interior.cabinet.validity interior.parts.validity]
        }.freeze

        module_function

        def install(runtime)
          return if runtime.modules.registered?('constructflow.interior')

          runtime.module_loader.load(MANIFEST)
          repository = Repository.new
          geometry = Geometry.new
          validator = Validators::InteriorValidator.new
          part_generator = JoineryPartGenerator.new
          quantity_provider = Quantity::InteriorQuantityProvider.new

          runtime.capabilities.register(
            'interior.joinery',
            owner_module: 'constructflow.interior',
            provider: repository
          )
          runtime.capabilities.register(
            'interior.quantity',
            owner_module: 'constructflow.interior',
            provider: quantity_provider
          )

          register_create(runtime, repository, geometry, validator)
          register_split(runtime, repository, geometry, validator)
          register_front(runtime, repository, geometry, validator)
          register_drawers(runtime, repository, geometry, validator)
          register_generate_parts(runtime, repository, validator, part_generator)
          install_ui(runtime)
        end

        def register_create(runtime, repository, geometry, validator)
          runtime.commands.register(
            'CreateCabinetRun',
            owner_module: 'constructflow.interior',
            validator: ->(command) { cabinet_validation_errors(command[:input], validator) }
          ) do |command|
            input = command[:input]
            definition = definition_from_input(input)
            module_count = Integer(input[:module_count] || input['module_count'] || 1)
            definition = definition.split_equal(count: module_count) if module_count > 1
            group = geometry.create_cabinet_group(runtime.active_model, definition)
            object = runtime.smart_objects.create(
              entity: group,
              type: 'interior.cabinet_run',
              owner_module: 'constructflow.interior',
              display_name: input[:display_name] || input['display_name'] || 'Cabinet Run',
              created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            repository.write_cabinet_run(group, definition)
            runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing', 'dirty_fabrication')
            issues = validator.validate_cabinet(definition)

            {
              created_object_ids: [object.id],
              warnings: warning_messages(issues),
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'interior.cabinet_run' } },
                { name: 'CabinetRunCreated', object_ids: [object.id], payload: { modules: definition.modules.length } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] },
                { name: 'ValidationStateChanged', object_ids: [object.id], payload: { issues: issues } }
              ]
            }
          end
        end

        def register_split(runtime, repository, geometry, validator)
          runtime.commands.register(
            'SplitCabinetModule',
            owner_module: 'constructflow.interior',
            validator: ->(command) { cabinet_edit_validation_errors(command[:input], runtime, repository, validator, :split) }
          ) do |command|
            input = command[:input]
            cabinet = resolve_cabinet(input, runtime)
            current = repository.read_cabinet_run(cabinet.entity)
            strategy = (input[:strategy] || input['strategy'] || 'equal').to_s
            updated = if strategy == 'explicit'
                        current.split_explicit(
                          widths_mm: input[:widths_mm] || input['widths_mm'],
                          min_width_mm: input[:min_width_mm] || input['min_width_mm'] || CabinetRunDefinition::MIN_MODULE_WIDTH_MM
                        )
                      else
                        current.split_equal(
                          count: input[:count] || input['count'] || 2,
                          min_width_mm: input[:min_width_mm] || input['min_width_mm'] || CabinetRunDefinition::MIN_MODULE_WIDTH_MM
                        )
                      end
            persist_design_change(runtime, repository, geometry, cabinet, updated)
            issues = validator.validate_cabinet(updated)
            {
              updated_object_ids: [cabinet.id],
              warnings: warning_messages(issues),
              events: design_change_events(
                cabinet.id,
                'CabinetModulesChanged',
                { strategy: strategy, modules: updated.modules }
              ) + [{ name: 'ValidationStateChanged', object_ids: [cabinet.id], payload: { issues: issues } }]
            }
          end
        end

        def register_front(runtime, repository, geometry, validator)
          runtime.commands.register(
            'AssignCabinetFront',
            owner_module: 'constructflow.interior',
            validator: ->(command) { cabinet_edit_validation_errors(command[:input], runtime, repository, validator, :front) }
          ) do |command|
            input = command[:input]
            cabinet = resolve_cabinet(input, runtime)
            current = repository.read_cabinet_run(cabinet.entity)
            updated = current.assign_front(
              module_id: input[:module_id] || input['module_id'],
              front_type: input[:front_type] || input['front_type'],
              style: input[:style] || input['style'] || 'flat',
              material_id: input[:material_id] || input['material_id'] || 'front.hmr.18'
            )
            persist_design_change(runtime, repository, geometry, cabinet, updated)
            issues = validator.validate_cabinet(updated)
            {
              updated_object_ids: [cabinet.id],
              warnings: warning_messages(issues),
              events: design_change_events(
                cabinet.id,
                'CabinetFrontChanged',
                { module_id: input[:module_id] || input['module_id'], front_type: input[:front_type] || input['front_type'] }
              ) + [{ name: 'ValidationStateChanged', object_ids: [cabinet.id], payload: { issues: issues } }]
            }
          end
        end

        def register_drawers(runtime, repository, geometry, validator)
          runtime.commands.register(
            'AddDrawerSet',
            owner_module: 'constructflow.interior',
            validator: ->(command) { cabinet_edit_validation_errors(command[:input], runtime, repository, validator, :drawers) }
          ) do |command|
            input = command[:input]
            cabinet = resolve_cabinet(input, runtime)
            current = repository.read_cabinet_run(cabinet.entity)
            updated = current.add_drawer_set(
              module_id: input[:module_id] || input['module_id'],
              count: input[:count] || input['count'],
              slide_type: input[:slide_type] || input['slide_type'] || 'soft_close',
              heights_mm: input[:heights_mm] || input['heights_mm'],
              face_material_id: input[:face_material_id] || input['face_material_id'] || 'front.hmr.18'
            )
            persist_design_change(runtime, repository, geometry, cabinet, updated)
            issues = validator.validate_cabinet(updated)
            {
              updated_object_ids: [cabinet.id],
              warnings: warning_messages(issues),
              events: design_change_events(
                cabinet.id,
                'DrawerSetChanged',
                { module_id: input[:module_id] || input['module_id'], count: input[:count] || input['count'] }
              ) + [{ name: 'ValidationStateChanged', object_ids: [cabinet.id], payload: { issues: issues } }]
            }
          end
        end

        def register_generate_parts(runtime, repository, validator, part_generator)
          runtime.commands.register(
            'GenerateJoineryParts',
            owner_module: 'constructflow.interior',
            validator: ->(command) { generate_parts_validation_errors(command[:input], runtime, repository) }
          ) do |command|
            cabinet = resolve_cabinet(command[:input], runtime)
            current = repository.read_cabinet_run(cabinet.entity)
            parts = part_generator.generate(cabinet_object_id: cabinet.id, definition: current)
            issues = validator.validate_part_set(parts, cabinet_definition: current)
            errors = issues.select { |issue| issue[:severity] == 'error' }
            raise ArgumentError, errors.map { |issue| issue[:message] }.join('; ') unless errors.empty?

            repository.write_part_set(cabinet.entity, parts)
            repository.write_cabinet_run(cabinet.entity, current.with(mode: 'fabrication'))
            runtime.smart_objects.clear_dirty(cabinet.entity, 'dirty_fabrication')
            runtime.smart_objects.mark_dirty(cabinet.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [cabinet.id],
              warnings: warning_messages(issues),
              events: [
                {
                  name: 'JoineryPartsGenerated',
                  object_ids: [cabinet.id],
                  payload: {
                    part_count: parts.part_count,
                    hardware_count: parts.hardware_count,
                    generator_version: parts.generator_version
                  }
                },
                { name: 'QuantityDirty', object_ids: [cabinet.id] },
                { name: 'DrawingDirty', object_ids: [cabinet.id] },
                { name: 'ValidationStateChanged', object_ids: [cabinet.id], payload: { issues: issues } }
              ]
            }
          end
        end

        def definition_from_input(input)
          CabinetRunDefinition.new(
            origin_mm: input[:origin_mm] || input['origin_mm'] || [0, 0, 0],
            angle_deg: input[:angle_deg] || input['angle_deg'] || 0,
            width_mm: input[:width_mm] || input['width_mm'] || 1200,
            height_mm: input[:height_mm] || input['height_mm'] || 800,
            depth_mm: input[:depth_mm] || input['depth_mm'] || 600,
            board_thickness_mm: input[:board_thickness_mm] || input['board_thickness_mm'] || 18,
            back_thickness_mm: input[:back_thickness_mm] || input['back_thickness_mm'] || 9,
            toe_kick_mm: input[:toe_kick_mm] || input['toe_kick_mm'] || 100,
            left_filler_mm: input[:left_filler_mm] || input['left_filler_mm'] || 0,
            right_filler_mm: input[:right_filler_mm] || input['right_filler_mm'] || 0,
            top_filler_mm: input[:top_filler_mm] || input['top_filler_mm'] || 0,
            carcass_material_id: input[:carcass_material_id] || input['carcass_material_id'] || 'board.hmr.18',
            front_gap_mm: input[:front_gap_mm] || input['front_gap_mm'] || 2,
            host_object_id: input[:host_object_id] || input['host_object_id'],
            parameters: input[:parameters] || input['parameters'] || input[:parametric_parameters] || input['parametric_parameters'] || {}
          )
        end

        def cabinet_validation_errors(input, validator)
          definition = definition_from_input(input)
          count = Integer(input[:module_count] || input['module_count'] || 1)
          definition = definition.split_equal(count: count) if count > 1
          validator.validate_cabinet(definition)
                   .select { |issue| issue[:severity] == 'error' }
                   .map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def cabinet_edit_validation_errors(input, runtime, repository, validator, kind)
          cabinet = resolve_cabinet(input, runtime)
          return ['cabinet run not found'] unless cabinet
          current = repository.read_cabinet_run(cabinet.entity)
          return ['cabinet definition missing'] unless current

          updated = case kind
                    when :split
                      strategy = (input[:strategy] || input['strategy'] || 'equal').to_s
                      if strategy == 'explicit'
                        current.split_explicit(
                          widths_mm: input[:widths_mm] || input['widths_mm'],
                          min_width_mm: input[:min_width_mm] || input['min_width_mm'] || CabinetRunDefinition::MIN_MODULE_WIDTH_MM
                        )
                      else
                        current.split_equal(
                          count: input[:count] || input['count'] || 2,
                          min_width_mm: input[:min_width_mm] || input['min_width_mm'] || CabinetRunDefinition::MIN_MODULE_WIDTH_MM
                        )
                      end
                    when :front
                      current.assign_front(
                        module_id: input[:module_id] || input['module_id'],
                        front_type: input[:front_type] || input['front_type'],
                        style: input[:style] || input['style'] || 'flat',
                        material_id: input[:material_id] || input['material_id'] || 'front.hmr.18'
                      )
                    else
                      current.add_drawer_set(
                        module_id: input[:module_id] || input['module_id'],
                        count: input[:count] || input['count'],
                        slide_type: input[:slide_type] || input['slide_type'] || 'soft_close',
                        heights_mm: input[:heights_mm] || input['heights_mm'],
                        face_material_id: input[:face_material_id] || input['face_material_id'] || 'front.hmr.18'
                      )
                    end
          validator.validate_cabinet(updated)
                   .select { |issue| issue[:severity] == 'error' }
                   .map { |issue| issue[:message] }
        rescue StandardError => error
          [error.message]
        end

        def generate_parts_validation_errors(input, runtime, repository)
          cabinet = resolve_cabinet(input, runtime)
          return ['cabinet run not found'] unless cabinet
          definition = repository.read_cabinet_run(cabinet.entity)
          definition ? definition.errors : ['cabinet definition missing']
        rescue StandardError => error
          [error.message]
        end

        def persist_design_change(runtime, repository, geometry, cabinet, definition)
          geometry.rebuild_cabinet!(cabinet.entity, definition)
          repository.write_cabinet_run(cabinet.entity, definition.with(mode: 'design'))
          repository.clear_part_set(cabinet.entity)
          runtime.smart_objects.mark_dirty(cabinet.entity, 'dirty_quantity', 'dirty_drawing', 'dirty_fabrication')
        end

        def design_change_events(object_id, event_name, payload)
          [
            { name: event_name, object_ids: [object_id], payload: payload },
            { name: 'GeometryChanged', object_ids: [object_id] },
            { name: 'QuantityDirty', object_ids: [object_id] },
            { name: 'DrawingDirty', object_ids: [object_id] }
          ]
        end

        def resolve_cabinet(input, runtime)
          entity = input[:cabinet_entity] || input['cabinet_entity'] || input[:entity] || input['entity']
          object_id = input[:cabinet_object_id] || input['cabinet_object_id'] || input[:object_id] || input['object_id']
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(object_id)
          return nil unless object && object.owner_module == 'constructflow.interior' && object.type == 'interior.cabinet_run'
          object
        end

        def warning_messages(issues)
          issues.select { |issue| issue[:severity] != 'error' }.map { |issue| issue[:message] }
        end

        def install_ui(runtime)
          menu = runtime.menu.add_submenu('Interior & Joinery')
          menu.add_item('Place Cabinet Run') do
            values = UI.inputbox(
              ['Width (mm)', 'Height (mm)', 'Depth (mm)', 'Modules', 'Carcass material'],
              ['1800', '800', '600', '3', 'board.hmr.18'],
              'ConstructFlow Cabinet Run'
            )
            next unless values
            params = {
              width_mm: Float(values[0]),
              height_mm: Float(values[1]),
              depth_mm: Float(values[2]),
              module_count: Integer(values[3]),
              carcass_material_id: values[4].to_s
            }
            runtime.active_model.select_tool(Tools::CabinetRunTool.new(runtime: runtime, params: params))
          rescue StandardError => error
            UI.messagebox("ConstructFlow Interior error: #{error.message}")
          end

          menu.add_item('Split Selected Cabinet Modules') do
            cabinet = selected_cabinet(runtime)
            unless cabinet
              UI.messagebox('Select one ConstructFlow Cabinet Run first.')
              next
            end
            values = UI.inputbox(['Equal module count'], ['3'], 'ConstructFlow Split Cabinet')
            next unless values
            execute_ui(runtime, 'SplitCabinetModule', cabinet.id, strategy: 'equal', count: Integer(values[0]))
          end

          menu.add_item('Assign Front to Selected Cabinet') do
            cabinet = selected_cabinet(runtime)
            unless cabinet
              UI.messagebox('Select one ConstructFlow Cabinet Run first.')
              next
            end
            values = UI.inputbox(
              ['Module ID', 'Front type', 'Style', 'Material ID'],
              ['M01', 'single_swing', 'flat', 'front.hmr.18'],
              'ConstructFlow Cabinet Front'
            )
            next unless values
            execute_ui(
              runtime, 'AssignCabinetFront', cabinet.id,
              module_id: values[0].to_s, front_type: values[1].to_s,
              style: values[2].to_s, material_id: values[3].to_s
            )
          end

          menu.add_item('Add Drawers to Selected Cabinet') do
            cabinet = selected_cabinet(runtime)
            unless cabinet
              UI.messagebox('Select one ConstructFlow Cabinet Run first.')
              next
            end
            values = UI.inputbox(
              ['Module ID', 'Drawer count', 'Slide type'],
              ['M01', '3', 'soft_close'],
              'ConstructFlow Drawer Set'
            )
            next unless values
            execute_ui(
              runtime, 'AddDrawerSet', cabinet.id,
              module_id: values[0].to_s, count: Integer(values[1]), slide_type: values[2].to_s
            )
          end

          menu.add_item('Generate Joinery Parts for Selected Cabinet') do
            cabinet = selected_cabinet(runtime)
            unless cabinet
              UI.messagebox('Select one ConstructFlow Cabinet Run first.')
              next
            end
            result = runtime.commands.execute(
              'GenerateJoineryParts',
              { cabinet_object_id: cabinet.id },
              project_id: runtime.project.project_id
            )
            if result[:status] == 'success'
              part_set = Repository.new.read_part_set(cabinet.entity)
              UI.messagebox(
                "Joinery parts generated\nParts: #{part_set&.part_count || 0}\nHardware: #{part_set&.hardware_count || 0}"
              )
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          end
        end

        def selected_cabinet(runtime)
          runtime.active_model.selection.filter_map { |entity| runtime.smart_objects.fetch(entity) }
                 .find { |object| object.owner_module == 'constructflow.interior' && object.type == 'interior.cabinet_run' }
        end

        def execute_ui(runtime, command_name, object_id, payload)
          result = runtime.commands.execute(
            command_name,
            payload.merge(cabinet_object_id: object_id),
            project_id: runtime.project.project_id
          )
          UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
          result
        rescue StandardError => error
          UI.messagebox("ConstructFlow Interior error: #{error.message}")
          nil
        end
      end
    end
  end
end
