# frozen_string_literal: true

require 'sketchup.rb'

require_relative 'core/id_generator'
require_relative 'core/diagnostic_log'
require_relative 'core/attribute_store'
require_relative 'core/units'
require_relative 'core/phase'
require_relative 'core/project_store'
require_relative 'core/level_registry'
require_relative 'core/migration_registry'
require_relative 'core/smart_object'
require_relative 'core/smart_object_manager'
require_relative 'core/transaction_manager'
require_relative 'core/event_bus'
require_relative 'core/command_bus'
require_relative 'core/module_registry'
require_relative 'core/module_loader'
require_relative 'core/capability_registry'
require_relative 'core/connector_registry'
require_relative 'core/mep_semantic_contract'
require_relative 'core/sketchup_app_observer'
require_relative 'core/drawing_sheet_spec'
require_relative 'core/drawing_intent_registry'
require_relative 'core/elevation_generator'
require_relative 'core/section_generator'
require_relative 'core/detail_callout_definition'
require_relative 'core/door_window_schedule_generator'
require_relative 'core/joinery_shop_drawing_generator'
require_relative 'core/qa/validator_registry'
require_relative 'core/qa/revision_tracker'
require_relative 'core/qa/site_verification_definition'
require_relative 'core/qa/stale_audit_service'
require_relative 'core/i18n'
require_relative 'core/html_dialog'
require_relative 'core/toolbar'
require_relative 'core/plan_interaction_engine'
require_relative 'core/plan_level_context'
require_relative 'core/plan_selection_filter'
require_relative 'core/representation_object_resolver'
require_relative 'core/parametric_object_engine'
require_relative 'core/constraint_engine'
require_relative 'core/schedule_editor'

require_relative 'modules/architecture/wall_definition'
require_relative 'modules/architecture/wall_repository'
require_relative 'modules/architecture/wall_join_engine'
require_relative 'modules/architecture/floor_definition'
require_relative 'modules/architecture/floor_repository'
require_relative 'modules/architecture/floor_geometry'
require_relative 'modules/architecture/floor_validator'
require_relative 'modules/architecture/room_definition'
require_relative 'modules/architecture/room_repository'
require_relative 'modules/architecture/room_geometry'
require_relative 'modules/architecture/room_validator'
require_relative 'modules/architecture/room_enclosure_detector'
require_relative 'modules/architecture/plan_reference_collector'
require_relative 'modules/architecture/documentation_representation_provider'
require_relative 'modules/architecture/ceiling_definition'
require_relative 'modules/architecture/ceiling_repository'
require_relative 'modules/architecture/ceiling_geometry'
require_relative 'modules/architecture/ceiling_validator'
require_relative 'modules/architecture/tools/floor_tool'
require_relative 'modules/architecture/tools/room_tool'
require_relative 'modules/architecture/tools/ceiling_tool'
require_relative 'modules/architecture/tools/boundary_edit_tool'
require_relative 'modules/architecture/validators/wall_validator'
require_relative 'modules/architecture/quantity/wall_quantity_provider'
require_relative 'modules/architecture/quantity/floor_quantity_provider'
require_relative 'modules/architecture/quantity/room_quantity_provider'
require_relative 'modules/architecture/quantity/ceiling_quantity_provider'
require_relative 'modules/architecture/wall_geometry'
require_relative 'modules/architecture/wall_host_capability'
require_relative 'modules/architecture/tools/wall_tool'
require_relative 'modules/architecture/tools/wall_edit_tool'
require_relative 'modules/architecture/registration'

require_relative 'modules/opening/opening_definition'
require_relative 'modules/opening/opening_repository'
require_relative 'modules/opening/validators/opening_validator'
require_relative 'modules/opening/quantity/opening_quantity_provider'
require_relative 'modules/opening/opening_geometry'
require_relative 'modules/opening/opening_infill_host_capability'
require_relative 'modules/opening/tools/opening_tool'
require_relative 'modules/opening/tools/opening_edit_tool'
require_relative 'modules/opening/registration'

require_relative 'modules/door_window/door_window_type'
require_relative 'modules/door_window/type_registry'
require_relative 'modules/door_window/instance_definition'
require_relative 'modules/door_window/instance_repository'
require_relative 'modules/door_window/validators/door_window_validator'
require_relative 'modules/door_window/quantity/door_window_quantity_provider'
require_relative 'modules/door_window/door_window_geometry'
require_relative 'modules/door_window/tools/place_tool'
require_relative 'modules/door_window/registration'

require_relative 'modules/extension/extension_definition'
require_relative 'modules/extension/repository'
require_relative 'modules/extension/geometry'
require_relative 'modules/extension/boundary_capability'
require_relative 'modules/extension/coordination_plan'
require_relative 'modules/extension/validators/extension_validator'
require_relative 'modules/extension/quantity/extension_quantity_provider'
require_relative 'modules/extension/registration'

require_relative 'modules/roof/roof_definition'
require_relative 'modules/roof/gutter_definition'
require_relative 'modules/roof/repository'
require_relative 'modules/roof/geometry'
require_relative 'modules/roof/edge_host_capability'
require_relative 'modules/roof/validators/roof_validator'
require_relative 'modules/roof/quantity/roof_quantity_provider'
require_relative 'modules/roof/tools/boundary_tool'
require_relative 'modules/roof/registration'

require_relative 'modules/structure/column_definition'
require_relative 'modules/structure/grid_definition'
require_relative 'modules/structure/beam_definition'
require_relative 'modules/structure/foundation_definition'
require_relative 'modules/structure/rebar_set_definition'
require_relative 'modules/structure/repository'
require_relative 'modules/structure/grid_geometry'
require_relative 'modules/structure/beam_geometry'
require_relative 'modules/structure/geometry'
require_relative 'modules/structure/coordination_capability'
require_relative 'modules/structure/validators/structure_validator'
require_relative 'modules/structure/quantity/structure_quantity_provider'
require_relative 'modules/structure/tools/column_tool'
require_relative 'modules/structure/tools/grid_tool'
require_relative 'modules/structure/tools/beam_tool'
require_relative 'modules/structure/registration'

require_relative 'modules/surface/surface_definition'
require_relative 'modules/surface/pattern_definition'
require_relative 'modules/surface/paving_layout_definition'
require_relative 'modules/surface/layout_solver'
require_relative 'modules/surface/border_definition'
require_relative 'modules/surface/parking_layout_definition'
require_relative 'modules/surface/repository'
require_relative 'modules/surface/geometry'
require_relative 'modules/surface/validators/surface_validator'
require_relative 'modules/surface/quantity/surface_quantity_provider'
require_relative 'modules/surface/tools/boundary_tool'
require_relative 'modules/surface/registration'
require_relative 'modules/surface/layout_registration'

require_relative 'modules/interior/cabinet_run_definition'
require_relative 'modules/interior/countertop_definition'
require_relative 'modules/interior/wardrobe_definition'
require_relative 'modules/interior/false_ceiling_definition'
require_relative 'modules/interior/wall_paneling_definition'
require_relative 'modules/interior/joinery_part_set_definition'
require_relative 'modules/interior/joinery_part_generator'
require_relative 'modules/interior/nesting_result_definition'
require_relative 'modules/interior/sheet_nesting_engine'
require_relative 'modules/interior/cut_list_exporter'
require_relative 'modules/interior/cnc_operation_generator'
require_relative 'modules/interior/repository'
require_relative 'modules/interior/geometry'
require_relative 'modules/interior/validators/interior_validator'
require_relative 'modules/interior/quantity/interior_quantity_provider'
require_relative 'modules/interior/tools/cabinet_run_tool'
require_relative 'modules/interior/registration'

require_relative 'modules/library/catalog_asset_definition'
require_relative 'modules/library/project_asset_snapshot'
require_relative 'modules/library/catalog_store'
require_relative 'modules/library/placed_asset_definition'
require_relative 'modules/library/placed_asset_repository'
require_relative 'modules/library/compatibility_engine'
require_relative 'modules/library/variant_matrix'
require_relative 'modules/library/lod_manager'
require_relative 'modules/library/geometry'
require_relative 'modules/library/catalog_capability'
require_relative 'modules/library/registration'

require_relative 'modules/drainage/manhole_definition'
require_relative 'modules/drainage/pipe_route_definition'
require_relative 'modules/drainage/repository'
require_relative 'modules/drainage/validators/drainage_validator'
require_relative 'modules/drainage/quantity/drainage_quantity_provider'
require_relative 'modules/drainage/geometry'
require_relative 'modules/drainage/tools/manhole_tool'
require_relative 'modules/drainage/registration'

require_relative 'modules/electrical/cable_definition'
require_relative 'modules/electrical/circuit_definition'
require_relative 'modules/electrical/conduit_route_definition'
require_relative 'modules/electrical/conduit_route_solver'
require_relative 'modules/electrical/conduit_sizing_engine'
require_relative 'modules/electrical/device_definition'
require_relative 'modules/electrical/panelboard_definition'
require_relative 'modules/electrical/voltage_drop_calculator'
require_relative 'modules/electrical/repository'
require_relative 'modules/electrical/geometry'
require_relative 'modules/electrical/quantity/electrical_quantity_provider'
require_relative 'modules/electrical/registration'

require_relative 'modules/costing/rate_item'
require_relative 'modules/costing/rate_library'
require_relative 'modules/costing/cost_estimate_line'
require_relative 'modules/costing/cost_estimate'
require_relative 'modules/costing/costing_engine'
require_relative 'modules/costing/estimate_snapshot'
require_relative 'modules/costing/boq_exporter'
require_relative 'modules/costing/repository'
require_relative 'modules/costing/registration'

module JiraNot
  module ConstructFlow
    module Runtime
      CORE_MANIFEST = {
        id: 'constructflow.core', name: 'ConstructFlow Core', version: '0.1.0', schema_version: 1,
        requires: [], optional_capabilities: [],
        provides: %w[core.smart_objects core.commands core.events core.levels core.capabilities core.connectors],
        objects: [], commands: %w[SetWorkingPhase UpdateProjectMetadata CreateLevel ModifyLevel DemolishObject ConvertSelectionToSmartObject],
        events: %w[WorkingPhaseChanged ProjectChanged LevelCreated LevelChanged ObjectCreated ObjectConverted ObjectDemolished ObjectPhaseChanged],
        providers: [], validators: []
      }.freeze

      class << self
        attr_reader :modules, :module_loader, :events, :commands, :levels, :project,
                    :smart_objects, :diagnostics, :migrations, :active_model, :menu,
                    :capabilities, :connectors

        def boot!
          return if @booted
          @ids = Core::IdGenerator.new
          @diagnostics = Core::DiagnosticLog.new
          @modules = Core::ModuleRegistry.new(diagnostics: @diagnostics)
          @modules.register(manifest: CORE_MANIFEST)
          @module_loader = Core::ModuleLoader.new(registry: @modules, diagnostics: @diagnostics)
          @capabilities = Core::CapabilityRegistry.new(diagnostics: @diagnostics)
          @connectors = Core::ConnectorRegistry.new(id_generator: @ids, diagnostics: @diagnostics)
          @events = Core::EventBus.new(id_generator: @ids, diagnostics: @diagnostics)
          @migrations = Core::MigrationRegistry.new
          @commands = Core::CommandBus.new(event_bus: @events, id_generator: @ids, diagnostics: @diagnostics)
          register_core_commands
          attach_model(Sketchup.active_model)
          install_model_observer
          install_ui_entry
          install_builtin_modules
          @booted = true
          @diagnostics.info('runtime_booted', 'ConstructFlow runtime booted')
        end

        def booted?
          !!@booted
        end

        def attach_model(model)
          return unless model
          @active_model = model
          @project = Core::ProjectStore.new(model, id_generator: @ids)
          @project.ensure_project!
          @levels = Core::LevelRegistry.new(project_store: @project)
          seed_default_level! if @levels.size.zero?
          @smart_objects = Core::SmartObjectManager.new(model: model, levels: @levels, id_generator: @ids, diagnostics: @diagnostics)
          object_count = @smart_objects.scan!
          @connectors.attach_model(model)
          @commands.transaction_manager = Core::TransactionManager.new(model: model)
          @diagnostics.info('model_attached', 'ConstructFlow attached to SketchUp model', project_id: @project.project_id,
                            smart_objects: object_count, levels: @levels.size,
                            connectors: @connectors.connector_count,
                            connections: @connectors.connection_count)
        end

        private

        def register_core_commands
          @commands.register('SetWorkingPhase', owner_module: 'constructflow.core', validator: lambda { |command|
            phase = command[:input][:phase] || command[:input]['phase']
            Core::Phase.valid?(phase) ? [] : ["invalid phase: #{phase}"]
          }) do |command|
            phase = command[:input][:phase] || command[:input]['phase']
            previous = @project.working_phase
            @project.working_phase = phase
            { events: [{ name: 'WorkingPhaseChanged', payload: { previous: previous, current: phase.to_s } }] }
          end

          @commands.register('UpdateProjectMetadata', owner_module: 'constructflow.core', validator: lambda { |command|
            name = command[:input][:name] || command[:input]['name']
            name.to_s.strip.empty? ? ['project name required'] : []
          }) do |command|
            input = command[:input]
            project = @project.update_metadata!(
              name: input[:name] || input['name'],
              code: input.key?(:code) ? input[:code] : input['code']
            )
            { events: [{ name: 'ProjectChanged', payload: { project: project } }] }
          end

          @commands.register('CreateLevel', owner_module: 'constructflow.core', validator: lambda { |command|
            input = command[:input]; errors = []
            errors << 'level id required' if (input[:id] || input['id']).to_s.strip.empty?
            errors << 'level name required' if (input[:name] || input['name']).to_s.strip.empty?
            errors
          }) do |command|
            input = command[:input]
            level = @levels.register(id: input[:id] || input['id'], name: input[:name] || input['name'],
                                     kind: input[:kind] || input['kind'] || 'custom',
                                     elevation_mm: input.key?(:elevation_mm) ? input[:elevation_mm] : input['elevation_mm'],
                                     source_state: input[:source_state] || input['source_state'] || 'confirmed')
            { events: [{ name: 'LevelCreated', payload: { level: level.to_h } }] }
          end

          @commands.register('ModifyLevel', owner_module: 'constructflow.core', validator: lambda { |command|
            id = command[:input][:id] || command[:input]['id']; id.to_s.strip.empty? ? ['level id required'] : []
          }) do |command|
            input = command[:input]; id = input[:id] || input['id']; before = @levels.fetch(id).to_h
            level = @levels.update(id, name: input[:name] || input['name'], kind: input[:kind] || input['kind'],
                                   elevation_mm: input.key?(:elevation_mm) ? input[:elevation_mm] : input['elevation_mm'],
                                   source_state: input[:source_state] || input['source_state'])
            { events: [{ name: 'LevelChanged', payload: { before: before, after: level.to_h } }] }
          end

          @commands.register('ConvertSelectionToSmartObject', owner_module: 'constructflow.core', validator: lambda { |command|
            input = command[:input]; errors = []
            errors << 'entity required' unless input[:entity] || input['entity']
            errors << 'type required' if (input[:type] || input['type']).to_s.strip.empty?
            owner = (input[:owner_module] || input['owner_module']).to_s
            errors << 'registered owner_module required' unless @modules.registered?(owner)
            errors
          }) do |command|
            input = command[:input]
            object = @smart_objects.create(entity: input[:entity] || input['entity'], type: input[:type] || input['type'],
                                           owner_module: input[:owner_module] || input['owner_module'],
                                           schema_version: input[:schema_version] || input['schema_version'] || 1,
                                           display_name: input[:display_name] || input['display_name'],
                                           created_phase: input[:created_phase] || input['created_phase'] || @project.working_phase,
                                           removed_phase: input[:removed_phase] || input['removed_phase'],
                                           level_refs: input[:level_refs] || input['level_refs'] || [],
                                           source_state: input[:source_state] || input['source_state'] || 'confirmed')
            { created_object_ids: [object.id], events: [{ name: 'ObjectCreated', object_ids: [object.id], payload: { type: object.type } },
                                                        { name: 'ObjectConverted', object_ids: [object.id], payload: { type: object.type } }] }
          end

          @commands.register('DemolishObject', owner_module: 'constructflow.core', validator: lambda { |command|
            object = resolve_object(command[:input])
            if object.nil? then ['smart object required'] elsif object.created_phase != Core::Phase::EXISTING then ['only existing construction can be demolished'] else [] end
          }) do |command|
            object = resolve_object(command[:input])
            updated = @smart_objects.update_lifecycle(object.entity, removed_phase: Core::Phase::DEMOLITION)
            @smart_objects.mark_dirty(updated.entity, 'dirty_quantity', 'dirty_drawing')
            { updated_object_ids: [updated.id], events: [{ name: 'ObjectDemolished', object_ids: [updated.id] },
                                                          { name: 'ObjectPhaseChanged', object_ids: [updated.id], payload: { removed_phase: Core::Phase::DEMOLITION } }] }
          end
        end

        def resolve_object(input)
          entity = input[:entity] || input['entity']; return @smart_objects.fetch(entity) if entity
          object_id = input[:object_id] || input['object_id']; object_id ? @smart_objects.fetch_by_id(object_id) : nil
        end

        def install_model_observer
          @app_observer = Core::SketchupAppObserver.new { |model| attach_model(model) }
          Sketchup.add_observer(@app_observer)
        end

        def install_ui_entry
          @menu = UI.menu('Extensions').add_submenu('ConstructFlow')
          @menu.add_item('Foundation Inspector') { show_inspector }
          @menu.add_item('Edit Project') do
            values = UI.inputbox(
              ['Project name', 'Project code'],
              [@project.project_name, @project.project_code.to_s],
              'ConstructFlow Edit Project'
            )
            next unless values

            result = @commands.execute(
              'UpdateProjectMetadata',
              { name: values[0], code: values[1] },
              project_id: @project.project_id
            )
            if result[:status] == 'success'
              UI.messagebox("Project #{values[0]} updated.")
            else
              UI.messagebox(Array(result[:errors]).join("\n"))
            end
          rescue ArgumentError => error
            UI.messagebox("ConstructFlow Project error: #{error.message}")
          end
          @menu.add_item('Create Level') do
            values = UI.inputbox(
              ['Level ID', 'Level name', 'Elevation (mm)', 'Kind'],
              ['', '', '0', 'FFL'],
              'ConstructFlow Create Level'
            )
            next unless values

            result = @commands.execute(
              'CreateLevel',
              { id: values[0].to_s.strip, name: values[1].to_s.strip,
                elevation_mm: Float(values[2]), kind: values[3].to_s.strip },
              project_id: @project.project_id
            )
            if result[:status] == 'success'
              UI.messagebox("Level #{values[0]} created.")
            else
              UI.messagebox(Array(result[:errors]).join("\n"))
            end
          rescue ArgumentError => error
            UI.messagebox("ConstructFlow Level error: #{error.message}")
          end
          @menu.add_item('Edit Level') do
            values = UI.inputbox(
              ['Level ID', 'Level name', 'Elevation (mm)', 'Kind'],
              ['', '', '0', 'FFL'],
              'ConstructFlow Edit Level'
            )
            next unless values

            result = @commands.execute(
              'ModifyLevel',
              { id: values[0].to_s.strip, name: values[1].to_s.strip,
                elevation_mm: Float(values[2]), kind: values[3].to_s.strip },
              project_id: @project.project_id
            )
            if result[:status] == 'success'
              UI.messagebox("Level #{values[0]} updated.")
            else
              UI.messagebox(Array(result[:errors]).join("\n"))
            end
          rescue ArgumentError => error
            UI.messagebox("ConstructFlow Level error: #{error.message}")
          end
          @menu.add_item('Show Levels') do
            levels = @levels.each.map do |level|
              elevation = level.elevation_mm.nil? ? 'unknown elevation' : "#{level.elevation_mm} mm"
              "#{level.id} — #{level.name} — #{elevation}"
            end
            UI.messagebox(levels.empty? ? 'No ConstructFlow levels defined.' : levels.join("\n"))
          end
          Core::Toolbar.install(self)
        end

        def install_builtin_modules
          Architecture::Registration.install(self)
          Opening::Registration.install(self)
          DoorWindow::Registration.install(self)
          Extension::Registration.install(self)
          Roof::Registration.install(self)
          Structure::Registration.install(self)
          Surface::Registration.install(self)
          Surface::LayoutRegistration.install(self)
          Interior::Registration.install(self)
          Library::Registration.install(self)
          Drainage::Registration.install(self)
          Electrical::Registration.install(self)
          Costing::Registration.install(self)
        end

        def show_inspector
          recent = @diagnostics.recent(5).map { |entry| "[#{entry.severity}] #{entry.code}: #{entry.message}" }
          level_names = @levels ? @levels.map { |l| "  • #{l.name} (#{l.elevation_mm || 0} mm)" } : []
          message = [
            'ConstructFlow - ตรวจสอบสถานะโครงการ',
            "รหัสโครงการ: #{@project&.project_id || '-'}",
            "ระยะเวลาก่อสร้าง (Phase): #{@project&.working_phase || '-'}",
            "โมดูลที่ติดตั้ง: #{@modules.size}",
            "ความสามารถระบบ: #{@capabilities.size}",
            "ระดับชั้นอาคาร (Levels): #{@levels&.size || 0}",
            *level_names,
            "วัตถุอัจฉริยะ (Smart Objects): #{@smart_objects&.size || 0}",
            "จุดเชื่อมต่อ (Connectors): #{@connectors&.connector_count || 0}",
            "เส้นทางเชื่อมต่อ (Connections): #{@connectors&.connection_count || 0}",
            '',
            'บันทึกการทำงานล่าสุด:',
            *(recent.empty? ? ['(ไม่มีบันทึก)'] : recent)
          ].join("\n")
          UI.messagebox(message, MB_OK)
        end

        def seed_default_level!
          @levels.register(
            id: 'level_ground_floor',
            name: 'Ground Floor',
            kind: 'floor',
            elevation_mm: 0.0,
            source_state: 'confirmed'
          )
          @diagnostics.info('level_seeded', 'Default Ground Floor level created', level_id: 'level_ground_floor')
        end
      end
    end
    Runtime.boot!
  end
end
