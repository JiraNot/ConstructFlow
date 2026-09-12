# frozen_string_literal: true

require_relative 'rate_item'
require_relative 'rate_library'
require_relative 'cost_estimate_line'
require_relative 'cost_estimate'
require_relative 'costing_engine'
require_relative 'estimate_snapshot'
require_relative 'boq_exporter'
require_relative 'repository'

module JiraNot
  module ConstructFlow
    module Costing
      module Registration
        MANIFEST = {
          id: 'constructflow.costing',
          name: 'Quantity, BOQ & Costing',
          version: '0.1.0',
          schema_version: 1,
          requires: ['constructflow.core'],
          provides: %w[costing.rates costing.estimates],
          objects: [],
          commands: %w[CreateRateLibrary UpdateRateItem GenerateCostEstimate CreateEstimateSnapshot ExportBOQ],
          events: %w[RateLibraryCreated RateItemUpdated CostEstimateGenerated EstimateSnapshotted BoqExported],
          providers: [],
          validators: []
        }.freeze

        module_function

        def install(runtime)
          return if runtime.modules.registered?('constructflow.costing')

          runtime.module_loader.load(MANIFEST)
          repository = Repository.new(runtime.active_model)
          engine = CostingEngine.new
          exporter = BoqExporter.new

          register_create_rate_library(runtime, repository)
          register_update_rate_item(runtime, repository)
          register_generate_estimate(runtime, repository, engine)
          register_snapshot(runtime, repository)
          register_export_boq(runtime, repository, exporter)
          install_ui(runtime)
        end

        def register_create_rate_library(runtime, repository)
          runtime.commands.register(
            'CreateRateLibrary',
            owner_module: 'constructflow.costing'
          ) do |command|
            input = command[:input]
            library = RateLibrary.new(
              id: input[:id] || input['id'],
              name: input[:name] || input['name'],
              version: input[:version] || input['version'] || 1,
              currency: input[:currency] || input['currency'] || 'THB'
            )
            repository.write_rate_library(runtime.active_model, library)
            {
              events: [
                {
                  name: 'RateLibraryCreated',
                  payload: { id: library.id, version: library.version, currency: library.currency }
                }
              ]
            }
          end
        end

        def register_update_rate_item(runtime, repository)
          runtime.commands.register(
            'UpdateRateItem',
            owner_module: 'constructflow.costing'
          ) do |command|
            input = command[:input]
            lib_id = input[:library_id] || input['library_id']
            library = repository.read_rate_library(runtime.active_model, lib_id)
            raise ArgumentError, "rate library not found: #{lib_id}" unless library

            item = RateItem.new(
              classification: input[:classification] || input['classification'],
              description: input[:description] || input['description'],
              unit: input[:unit] || input['unit'],
              material_rate: input[:material_rate] || input['material_rate'] || 0.0,
              labor_rate: input[:labor_rate] || input['labor_rate'] || 0.0,
              equipment_rate: input[:equipment_rate] || input['equipment_rate'] || 0.0,
              default_waste_pct: input[:default_waste_pct] || input['default_waste_pct'] || 0.0,
              currency: library.currency
            )
            updated_lib = library.add_or_update_item(item)
            repository.write_rate_library(runtime.active_model, updated_lib)

            {
              events: [
                {
                  name: 'RateItemUpdated',
                  payload: { library_id: lib_id, classification: item.classification, unit_rate: item.unit_rate }
                }
              ]
            }
          end
        end

        def register_generate_estimate(runtime, repository, engine)
          runtime.commands.register(
            'GenerateCostEstimate',
            owner_module: 'constructflow.costing'
          ) do |command|
            input = command[:input]
            lib_id = input[:rate_library_id] || input['rate_library_id']
            library = repository.read_rate_library(runtime.active_model, lib_id)
            raise ArgumentError, "rate library not found: #{lib_id}" unless library

            quantity_items = input[:quantity_items] || input['quantity_items'] || []
            estimate = engine.generate(
              quantity_items: quantity_items,
              rate_library: library,
              estimate_id: input[:estimate_id] || input['estimate_id']
            )
            repository.write_estimate(runtime.active_model, estimate)

            {
              events: [
                {
                  name: 'CostEstimateGenerated',
                  payload: estimate.to_h
                }
              ]
            }
          end
        end

        def register_snapshot(runtime, repository)
          runtime.commands.register(
            'CreateEstimateSnapshot',
            owner_module: 'constructflow.costing'
          ) do |command|
            input = command[:input]
            est_id = input[:estimate_id] || input['estimate_id']
            estimate = repository.read_estimate(runtime.active_model, est_id)
            raise ArgumentError, "estimate not found: #{est_id}" unless estimate

            snap_id = input[:snapshot_id] || input['snapshot_id'] || "snap_#{est_id}"
            snapshot = EstimateSnapshot.new(
              snapshot_id: snap_id,
              estimate_id: estimate.estimate_id,
              rate_library_id: estimate.rate_library_id,
              rate_library_version: estimate.rate_library_version,
              project_revision: input[:project_revision] || input['project_revision'] || 1,
              total_cost: estimate.total_cost,
              currency: estimate.currency,
              estimate_payload: estimate.to_h
            )
            repository.write_snapshot(runtime.active_model, snapshot)

            {
              events: [
                {
                  name: 'EstimateSnapshotted',
                  payload: { snapshot_id: snapshot.snapshot_id, total_cost: snapshot.total_cost }
                }
              ]
            }
          end
        end

        def register_export_boq(runtime, repository, exporter)
          runtime.commands.register(
            'ExportBOQ',
            owner_module: 'constructflow.costing'
          ) do |command|
            input = command[:input]
            est_id = input[:estimate_id] || input['estimate_id']
            estimate = repository.read_estimate(runtime.active_model, est_id)
            raise ArgumentError, "estimate not found: #{est_id}" unless estimate

            boq = exporter.export(estimate)
            {
              events: [
                {
                  name: 'BoqExported',
                  payload: boq
                }
              ]
            }
          end
        end

        def install_ui(runtime)
          return unless runtime.respond_to?(:menu) && runtime.menu

          menu = runtime.menu.add_submenu('Quantity & Costing')
          menu.add_item('Generate Project BOQ') do
            UI.messagebox('ConstructFlow BOQ generator ready.')
          end
        end
      end
    end
  end
end
