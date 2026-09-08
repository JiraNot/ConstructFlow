# frozen_string_literal: true

require 'sketchup.rb'

require_relative 'core/id_generator'
require_relative 'core/diagnostic_log'
require_relative 'core/attribute_store'
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
require_relative 'core/sketchup_app_observer'

module JiraNot
  module ConstructFlow
    module Runtime
      CORE_MANIFEST = {
        id: 'constructflow.core',
        name: 'ConstructFlow Core',
        version: '0.1.0',
        schema_version: 1,
        requires: [],
        optional_capabilities: [],
        provides: %w[core.smart_objects core.commands core.events core.levels],
        objects: [],
        commands: %w[SetWorkingPhase CreateLevel ModifyLevel DemolishObject ConvertSelectionToSmartObject],
        events: %w[WorkingPhaseChanged LevelCreated LevelChanged ObjectCreated ObjectConverted ObjectDemolished ObjectPhaseChanged],
        providers: [],
        validators: []
      }.freeze

      class << self
        attr_reader :modules, :module_loader, :events, :commands, :levels, :project,
                    :smart_objects, :diagnostics, :migrations, :active_model

        def boot!
          return if @booted

          @ids = Core::IdGenerator.new
          @diagnostics = Core::DiagnosticLog.new
          @modules = Core::ModuleRegistry.new(diagnostics: @diagnostics)
          @modules.register(manifest: CORE_MANIFEST)
          @module_loader = Core::ModuleLoader.new(registry: @modules, diagnostics: @diagnostics)
          @events = Core::EventBus.new(id_generator: @ids, diagnostics: @diagnostics)
          @migrations = Core::MigrationRegistry.new
          @commands = Core::CommandBus.new(
            event_bus: @events,
            id_generator: @ids,
            diagnostics: @diagnostics
          )

          register_core_commands
          attach_model(Sketchup.active_model)
          install_model_observer
          install_ui_entry
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
          @smart_objects = Core::SmartObjectManager.new(
            model: model,
            levels: @levels,
            id_generator: @ids,
            diagnostics: @diagnostics
          )
          object_count = @smart_objects.scan!
          @commands.transaction_manager = Core::TransactionManager.new(model: model)
          @diagnostics.info(
            'model_attached',
            'ConstructFlow attached to SketchUp model',
            project_id: @project.project_id,
            smart_objects: object_count
          )
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
            {
              events: [{
                name: 'WorkingPhaseChanged',
                payload: { previous: previous, current: phase.to_s }
              }]
            }
          end

          @commands.register('CreateLevel', owner_module: 'constructflow.core', validator: lambda { |command|
            input = command[:input]
            errors = []
            errors << 'level id required' if (input[:id] || input['id']).to_s.strip.empty?
            errors << 'level name required' if (input[:name] || input['name']).to_s.strip.empty?
            errors
          }) do |command|
            input = command[:input]
            level = @levels.register(
              id: input[:id] || input['id'],
              name: input[:name] || input['name'],
              kind: input[:kind] || input['kind'] || 'custom',
              elevation_mm: input.key?(:elevation_mm) ? input[:elevation_mm] : input['elevation_mm'],
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            {
              events: [{ name: 'LevelCreated', payload: { level: level.to_h } }]
            }
          end

          @commands.register('ModifyLevel', owner_module: 'constructflow.core', validator: lambda { |command|
            id = command[:input][:id] || command[:input]['id']
            id.to_s.strip.empty? ? ['level id required'] : []
          }) do |command|
            input = command[:input]
            id = input[:id] || input['id']
            before = @levels.fetch(id).to_h
            level = @levels.update(
              id,
              name: input[:name] || input['name'],
              kind: input[:kind] || input['kind'],
              elevation_mm: input.key?(:elevation_mm) ? input[:elevation_mm] : input['elevation_mm'],
              source_state: input[:source_state] || input['source_state']
            )
            {
              events: [{ name: 'LevelChanged', payload: { before: before, after: level.to_h } }]
            }
          end

          @commands.register('ConvertSelectionToSmartObject', owner_module: 'constructflow.core', validator: lambda { |command|
            input = command[:input]
            errors = []
            errors << 'entity required' unless input[:entity] || input['entity']
            errors << 'type required' if (input[:type] || input['type']).to_s.strip.empty?
            owner = (input[:owner_module] || input['owner_module']).to_s
            errors << 'registered owner_module required' unless @modules.registered?(owner)
            errors
          }) do |command|
            input = command[:input]
            object = @smart_objects.create(
              entity: input[:entity] || input['entity'],
              type: input[:type] || input['type'],
              owner_module: input[:owner_module] || input['owner_module'],
              schema_version: input[:schema_version] || input['schema_version'] || 1,
              display_name: input[:display_name] || input['display_name'],
              created_phase: input[:created_phase] || input['created_phase'] || @project.working_phase,
              removed_phase: input[:removed_phase] || input['removed_phase'],
              level_refs: input[:level_refs] || input['level_refs'] || [],
              source_state: input[:source_state] || input['source_state'] || 'confirmed'
            )
            {
              created_object_ids: [object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: object.type } },
                { name: 'ObjectConverted', object_ids: [object.id], payload: { type: object.type } }
              ]
            }
          end

          @commands.register('DemolishObject', owner_module: 'constructflow.core', validator: lambda { |command|
            object = resolve_object(command[:input])
            if object.nil?
              ['smart object required']
            elsif object.created_phase != Core::Phase::EXISTING
              ['only existing construction can be demolished']
            else
              []
            end
          }) do |command|
            object = resolve_object(command[:input])

            updated = @smart_objects.update_lifecycle(object.entity, removed_phase: Core::Phase::DEMOLITION)
            @smart_objects.mark_dirty(updated.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [updated.id],
              events: [
                { name: 'ObjectDemolished', object_ids: [updated.id] },
                { name: 'ObjectPhaseChanged', object_ids: [updated.id], payload: { removed_phase: Core::Phase::DEMOLITION } }
              ]
            }
          end
        end

        def resolve_object(input)
          entity = input[:entity] || input['entity']
          return @smart_objects.fetch(entity) if entity

          object_id = input[:object_id] || input['object_id']
          object_id ? @smart_objects.fetch_by_id(object_id) : nil
        end

        def install_model_observer
          @app_observer = Core::SketchupAppObserver.new { |model| attach_model(model) }
          Sketchup.add_observer(@app_observer)
        end

        def install_ui_entry
          menu = UI.menu('Extensions').add_submenu('ConstructFlow')
          menu.add_item('Foundation Inspector') { show_inspector }
        end

        def show_inspector
          recent = @diagnostics.recent(5).map do |entry|
            "[#{entry.severity}] #{entry.code}: #{entry.message}"
          end
          message = [
            'ConstructFlow Foundation',
            "Project: #{@project&.project_id || '-'}",
            "Working phase: #{@project&.working_phase || '-'}",
            "Modules: #{@modules.size}",
            "Levels: #{@levels&.size || 0}",
            "Smart objects: #{@smart_objects&.size || 0}",
            '',
            'Recent diagnostics:',
            *(recent.empty? ? ['(none)'] : recent)
          ].join("\n")
          UI.messagebox(message)
        end
      end
    end

    Runtime.boot!
  end
end
