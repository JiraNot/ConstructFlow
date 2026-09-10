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
require_relative 'core/sketchup_app_observer'
require_relative 'core/entity_guard'
require_relative 'core/geometry_guard'

require_relative 'modules/architecture/wall_definition'
require_relative 'modules/architecture/wall_repository'
require_relative 'modules/architecture/validators/wall_validator'
require_relative 'modules/architecture/quantity/wall_quantity_provider'
require_relative 'modules/architecture/wall_geometry'
require_relative 'modules/architecture/wall_host_capability'
require_relative 'modules/architecture/tools/wall_tool'
require_relative 'modules/architecture/registration'
require_relative 'modules/opening/opening_definition'
require_relative 'modules/opening/opening_repository'
require_relative 'modules/opening/validators/opening_validator'
require_relative 'modules/opening/quantity/opening_quantity_provider'
require_relative 'modules/opening/opening_geometry'
require_relative 'modules/opening/opening_infill_host_capability'
require_relative 'modules/opening/tools/opening_tool'
require_relative 'modules/opening/registration'
require_relative 'modules/door_window/door_window_type'
require_relative 'modules/door_window/type_registry'
require_relative 'modules/door_window/instance_definition'
require_relative 'modules/door_window/instance_repository'
require_relative 'modules/door_window/validators/door_window_validator'
require_relative 'modules/door_window/quantity/door_window_quantity_provider'
require_relative 'modules/door_window/door_window_geometry'
require_relative 'modules/door_window/registration'
require_relative 'modules/extension/extension_definition'
require_relative 'modules/extension/repository'
require_relative 'modules/extension/geometry'
require_relative 'modules/extension/boundary_capability'
require_relative 'modules/extension/coordination_plan'
require_relative 'modules/extension/generator'
require_relative 'modules/extension/orchestrator'
require_relative 'modules/extension/execution_result'
require_relative 'modules/extension/execution_engine'
require_relative 'modules/extension/domain_handlers'
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
require_relative 'modules/roof/registration'
require_relative 'modules/structure/column_definition'
require_relative 'modules/structure/foundation_definition'
require_relative 'modules/structure/rebar_set_definition'
require_relative 'modules/structure/repository'
require_relative 'modules/structure/geometry'
require_relative 'modules/structure/coordination_capability'
require_relative 'modules/structure/validators/structure_validator'
require_relative 'modules/structure/quantity/structure_quantity_provider'
require_relative 'modules/structure/tools/column_tool'
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
require_relative 'modules/surface/registration'
require_relative 'modules/surface/layout_registration'
require_relative 'modules/interior/cabinet_run_definition'
require_relative 'modules/interior/joinery_part_set_definition'
require_relative 'modules/interior/joinery_part_generator'
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

module JiraNot
  module ConstructFlow
    module Runtime
      CORE_MANIFEST = {
        id: 'constructflow.core', name: 'ConstructFlow Core', version: '0.1.0', schema_version: 1,
        requires: [], optional_capabilities: [],
        provides: %w[core.smart_objects core.commands core.events core.levels core.capabilities core.connectors],
        objects: [], commands: %w[SetWorkingPhase CreateLevel ModifyLevel DemolishObject ConvertSelectionToSmartObject],
        events: %w[WorkingPhaseChanged LevelCreated LevelChanged ObjectCreated ObjectConverted ObjectDemolished ObjectPhaseChanged],
        providers: [], validators: []
      }.freeze

      class << self
        attr_reader :modules, :module_loader, :events, :commands, :levels, :project,
                    :smart_objects, :diagnostics, :migrations, :active_model, :menu,
                    :capabilities, :connectors, :extension_execution_engine

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
          install_extension_execution_engine
          @booted = true
          @diagnostics.info('runtime_booted', 'ConstructFlow runtime booted')
        end

        def extension_plan(definition, options = {})
          Extension::Orchestrator.new(Extension::Generator.new(definition)).plan(options)
        end

        def execute_extension(plan, dry_run: false)
          raise 'extension execution engine is not installed' unless @extension_execution_engine
          @extension_execution_engine.execute(plan, dry_run: dry_run)
        end

        private

        def install_extension_execution_engine
          handlers = Extension::DomainHandlers.build(self)
          @extension_execution_engine = ExtensionExecutionEngine.new(
            handlers: handlers,
            transaction_manager: @commands.transaction_manager
          )
        end

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
            @smart_objects.update_phase(object.id, Core::Phase::DEMOLISHED)
            { removed_object_ids: [object.id], events: [{ name: 'ObjectDemolished', object_ids: [object.id], payload: { type: object.type } }] }
          end
        end

        def resolve_object(input)
          id = input[:id] || input['id']
          return @smart_objects.fetch(id) if id
          entity = input[:entity] || input['entity']
          return @smart_objects.find_by_entity(entity) if entity
          nil
        end
      end
    end
  end
end
