# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Library
      module Registration
        MANIFEST = {
          id: 'constructflow.library',
          name: 'Model, Catalog & Assembly Library',
          version: '0.1.0',
          schema_version: 1,
          requires: ['constructflow.core'],
          optional_capabilities: %w[architecture.wall_host opening.infill_host roof.edge_host interior.joinery],
          provides: %w[library.catalog],
          objects: %w[library.fixed_asset],
          commands: %w[CreateLibraryFolder RegisterCatalogAsset AddToProjectLibrary PinAssetVersion PlaceCatalogAsset SwapCatalogAsset ReplaceCatalogConstruction],
          events: %w[LibraryFolderCreated CatalogAssetRegistered ProjectAssetSnapshotted CatalogAssetPlaced CatalogAssetSwapped CatalogConstructionReplaced QuantityDirty DrawingDirty],
          providers: ['constructflow.library.catalog'],
          validators: []
        }.freeze

        module_function

        def install(runtime)
          return if runtime.modules.registered?('constructflow.library')

          runtime.module_loader.load(MANIFEST)
          placed_repository = PlacedAssetRepository.new
          geometry = Geometry.new
          runtime.capabilities.register(
            'library.catalog',
            owner_module: 'constructflow.library',
            provider: CatalogCapability.new(runtime)
          )

          register_folder(runtime)
          register_asset(runtime)
          register_snapshot(runtime)
          register_pin(runtime)
          register_place(runtime, placed_repository, geometry)
          register_swap(runtime, placed_repository, geometry)
          register_replace(runtime, placed_repository, geometry)
          install_ui(runtime, placed_repository)
        end

        def register_folder(runtime)
          runtime.commands.register(
            'CreateLibraryFolder',
            owner_module: 'constructflow.library',
            validator: ->(command) { folder_errors(command[:input]) }
          ) do |command|
            input = command[:input]
            folder = store(runtime).create_folder(
              id: input[:id] || input['id'],
              name: input[:name] || input['name'],
              parent_id: input[:parent_id] || input['parent_id']
            )
            { events: [{ name: 'LibraryFolderCreated', payload: { folder: folder } }] }
          end
        end

        def register_asset(runtime)
          runtime.commands.register(
            'RegisterCatalogAsset',
            owner_module: 'constructflow.library',
            validator: ->(command) { asset_errors(command[:input]) }
          ) do |command|
            input = command[:input]
            definition = asset_from_input(input)
            store(runtime).register_asset(
              definition,
              folder_id: input[:folder_id] || input['folder_id'],
              replace_same_version: input[:replace_same_version] || input['replace_same_version'] || false
            )
            {
              events: [{
                name: 'CatalogAssetRegistered',
                payload: { asset_id: definition.asset_id, version: definition.version, asset_class: definition.asset_class }
              }]
            }
          end
        end

        def register_snapshot(runtime)
          runtime.commands.register(
            'AddToProjectLibrary',
            owner_module: 'constructflow.library',
            validator: ->(command) { asset_reference_errors(command[:input], runtime) }
          ) do |command|
            input = command[:input]
            snapshot = store(runtime).add_to_project_library(
              asset_id: input[:asset_id] || input['asset_id'],
              version: input[:version] || input['version'],
              pin: input[:pin] || input['pin'] || false,
              source_scope: input[:source_scope] || input['source_scope'] || 'company'
            )
            {
              events: [{
                name: 'ProjectAssetSnapshotted',
                payload: { snapshot_id: snapshot.snapshot_id, asset_id: snapshot.asset_id, version: snapshot.asset_version }
              }]
            }
          end
        end

        def register_pin(runtime)
          runtime.commands.register(
            'PinAssetVersion',
            owner_module: 'constructflow.library',
            validator: lambda { |command|
              snapshot_id = command[:input][:snapshot_id] || command[:input]['snapshot_id']
              begin
                store(runtime).project_snapshot(snapshot_id)
                []
              rescue StandardError => error
                [error.message]
              end
            }
          ) do |command|
            input = command[:input]
            snapshot = store(runtime).pin_snapshot(
              input[:snapshot_id] || input['snapshot_id'],
              pinned: input.key?(:pinned) ? input[:pinned] : input.fetch('pinned', true)
            )
            { events: [{ name: 'ProjectAssetSnapshotted', payload: { snapshot_id: snapshot.snapshot_id, pinned: snapshot.pinned } }] }
          end
        end

        def register_place(runtime, repository, geometry)
          runtime.commands.register(
            'PlaceCatalogAsset',
            owner_module: 'constructflow.library',
            validator: ->(command) { place_errors(command[:input], runtime) }
          ) do |command|
            object, definition, asset = create_fixed_asset(runtime, repository, geometry, command[:input])
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              created_object_ids: [object.id],
              events: [
                { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'library.fixed_asset' } },
                { name: 'CatalogAssetPlaced', object_ids: [object.id], payload: { asset_id: asset.asset_id, version: asset.version, snapshot_id: definition.snapshot_id } },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end
        end

        def register_swap(runtime, repository, geometry)
          runtime.commands.register(
            'SwapCatalogAsset',
            owner_module: 'constructflow.library',
            validator: ->(command) { swap_errors(command[:input], runtime, repository) }
          ) do |command|
            input = command[:input]
            object = resolve_fixed_asset(input, runtime)
            current = repository.read(object.entity)
            asset = store(runtime).asset(
              input[:asset_id] || input['asset_id'],
              version: input[:version] || input['version']
            )
            snapshot = store(runtime).add_to_project_library(asset_id: asset.asset_id, version: asset.version)
            updated = current.with(
              snapshot_id: snapshot.snapshot_id,
              asset_id: asset.asset_id,
              asset_version: asset.version,
              dimensions_mm: asset.dimensions_mm,
              lod_key: input[:lod_key] || input['lod_key'] || current.lod_key,
              variant_state: input[:variant_state] || input['variant_state'] || current.variant_state
            )
            geometry.rebuild_fixed_asset!(object.entity, updated)
            repository.write(object.entity, updated)
            store(runtime).record_placement(snapshot.snapshot_id, object_id: object.id)
            runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
            {
              updated_object_ids: [object.id],
              events: [
                {
                  name: 'CatalogAssetSwapped',
                  object_ids: [object.id],
                  payload: {
                    previous_asset_id: current.asset_id,
                    previous_version: current.asset_version,
                    asset_id: asset.asset_id,
                    version: asset.version,
                    identity_preserved: true
                  }
                },
                { name: 'GeometryChanged', object_ids: [object.id] },
                { name: 'QuantityDirty', object_ids: [object.id] },
                { name: 'DrawingDirty', object_ids: [object.id] }
              ]
            }
          end
        end

        def register_replace(runtime, repository, geometry)
          runtime.commands.register(
            'ReplaceCatalogConstruction',
            owner_module: 'constructflow.library',
            validator: ->(command) { replace_errors(command[:input], runtime, repository) }
          ) do |command|
            input = command[:input]
            old_object = resolve_fixed_asset(input, runtime)
            old_definition = repository.read(old_object.entity)
            runtime.smart_objects.update_lifecycle(old_object.entity, removed_phase: Core::Phase::DEMOLITION)
            runtime.smart_objects.mark_dirty(old_object.entity, 'dirty_quantity', 'dirty_drawing')

            new_input = {
              asset_id: input[:asset_id] || input['asset_id'],
              version: input[:version] || input['version'],
              location_mm: input[:location_mm] || input['location_mm'] || old_definition.location_mm,
              rotation_deg: input[:rotation_deg] || input['rotation_deg'] || old_definition.rotation_deg,
              lod_key: input[:lod_key] || input['lod_key'] || old_definition.lod_key,
              created_phase: Core::Phase::NEW_CONSTRUCTION,
              source_state: input[:source_state] || input['source_state'] || old_object.source_state,
              display_name: input[:display_name] || input['display_name']
            }
            new_object, new_definition, asset = create_fixed_asset(runtime, repository, geometry, new_input)
            runtime.smart_objects.add_relationship(old_object.entity, kind: 'replaced_by', target_id: new_object.id, role: 'catalog_replacement')
            runtime.smart_objects.add_relationship(new_object.entity, kind: 'replaces', target_id: old_object.id, role: 'catalog_replacement')
            runtime.smart_objects.mark_dirty(new_object.entity, 'dirty_quantity', 'dirty_drawing')

            {
              created_object_ids: [new_object.id],
              updated_object_ids: [old_object.id],
              events: [
                { name: 'ObjectDemolished', object_ids: [old_object.id] },
                { name: 'ObjectCreated', object_ids: [new_object.id], payload: { type: 'library.fixed_asset' } },
                {
                  name: 'CatalogConstructionReplaced',
                  object_ids: [old_object.id, new_object.id],
                  payload: { old_asset_id: old_definition.asset_id, new_asset_id: asset.asset_id, snapshot_id: new_definition.snapshot_id }
                },
                { name: 'RelationshipChanged', object_ids: [old_object.id, new_object.id], payload: { kind: 'replacement' } },
                { name: 'QuantityDirty', object_ids: [old_object.id, new_object.id] },
                { name: 'DrawingDirty', object_ids: [old_object.id, new_object.id] }
              ]
            }
          end
        end

        def create_fixed_asset(runtime, repository, geometry, input)
          catalog = store(runtime)
          asset = catalog.asset(input[:asset_id] || input['asset_id'], version: input[:version] || input['version'])
          raise ArgumentError, 'v1 placement supports fixed assets only; parametric assets must be placed by their owner module command' unless asset.fixed_asset?

          snapshot = catalog.add_to_project_library(asset_id: asset.asset_id, version: asset.version)
          definition = PlacedAssetDefinition.new(
            snapshot_id: snapshot.snapshot_id,
            asset_id: asset.asset_id,
            asset_version: asset.version,
            location_mm: input[:location_mm] || input['location_mm'] || [0, 0, 0],
            rotation_deg: input[:rotation_deg] || input['rotation_deg'] || 0,
            dimensions_mm: asset.dimensions_mm,
            lod_key: input[:lod_key] || input['lod_key'] || 'design',
            variant_state: input[:variant_state] || input['variant_state'] || {}
          )
          group = geometry.create_fixed_asset_group(runtime.active_model, definition)
          object = runtime.smart_objects.create(
            entity: group,
            type: 'library.fixed_asset',
            owner_module: 'constructflow.library',
            display_name: input[:display_name] || input['display_name'] || asset.name,
            created_phase: input[:created_phase] || input['created_phase'] || runtime.project.working_phase,
            source_state: input[:source_state] || input['source_state'] || 'confirmed'
          )
          repository.write(group, definition)
          catalog.record_placement(snapshot.snapshot_id, object_id: object.id)
          [object, definition, asset]
        end

        def asset_from_input(input)
          CatalogAssetDefinition.new(
            asset_id: input[:asset_id] || input['asset_id'],
            version: input[:version] || input['version'],
            name: input[:name] || input['name'],
            asset_class: input[:asset_class] || input['asset_class'],
            category: input[:category] || input['category'],
            subcategory: input[:subcategory] || input['subcategory'],
            owner_module: input[:owner_module] || input['owner_module'] || 'constructflow.library',
            family: input[:family] || input['family'],
            variant: input[:variant] || input['variant'],
            tags: input[:tags] || input['tags'] || [],
            dimensions_mm: input[:dimensions_mm] || input['dimensions_mm'],
            parameter_schema: input[:parameter_schema] || input['parameter_schema'] || {},
            host_capability: input[:host_capability] || input['host_capability'],
            connector_capabilities: input[:connector_capabilities] || input['connector_capabilities'] || [],
            manufacturer: input[:manufacturer] || input['manufacturer'],
            product: input[:product] || input['product'],
            sku: input[:sku] || input['sku'],
            quantity_unit: input[:quantity_unit] || input['quantity_unit'] || 'pcs',
            lod: input[:lod] || input['lod'] || {},
            placement_command: input[:placement_command] || input['placement_command'],
            metadata: input[:metadata] || input['metadata'] || {}
          )
        end

        def folder_errors(input)
          errors = []
          errors << 'folder id required' if (input[:id] || input['id']).to_s.strip.empty?
          errors << 'folder name required' if (input[:name] || input['name']).to_s.strip.empty?
          errors
        end

        def asset_errors(input)
          asset_from_input(input).errors
        rescue StandardError => error
          [error.message]
        end

        def asset_reference_errors(input, runtime)
          store(runtime).asset(input[:asset_id] || input['asset_id'], version: input[:version] || input['version'])
          []
        rescue StandardError => error
          [error.message]
        end

        def place_errors(input, runtime)
          asset = store(runtime).asset(input[:asset_id] || input['asset_id'], version: input[:version] || input['version'])
          errors = []
          errors << 'v1 PlaceCatalogAsset supports fixed_asset only' unless asset.fixed_asset?
          errors << 'fixed asset requires dimensions for proxy placement' unless asset.dimensions_mm
          errors
        rescue StandardError => error
          [error.message]
        end

        def swap_errors(input, runtime, repository)
          object = resolve_fixed_asset(input, runtime)
          return ['placed fixed asset not found'] unless object
          return ['placed asset definition missing'] unless repository.read(object.entity)
          asset = store(runtime).asset(input[:asset_id] || input['asset_id'], version: input[:version] || input['version'])
          asset.fixed_asset? ? [] : ['v1 swap supports fixed_asset to fixed_asset only']
        rescue StandardError => error
          [error.message]
        end

        def replace_errors(input, runtime, repository)
          object = resolve_fixed_asset(input, runtime)
          return ['placed fixed asset not found'] unless object
          return ['ReplaceCatalogConstruction requires Existing construction'] unless object.created_phase == Core::Phase::EXISTING
          return ['placed asset definition missing'] unless repository.read(object.entity)
          asset = store(runtime).asset(input[:asset_id] || input['asset_id'], version: input[:version] || input['version'])
          asset.fixed_asset? ? [] : ['v1 replacement supports fixed_asset only']
        rescue StandardError => error
          [error.message]
        end

        def resolve_fixed_asset(input, runtime)
          entity = input[:entity] || input['entity'] || input[:placed_entity] || input['placed_entity']
          object_id = input[:object_id] || input['object_id'] || input[:placed_object_id] || input['placed_object_id']
          object = entity ? runtime.smart_objects.fetch(entity) : runtime.smart_objects.fetch_by_id(object_id)
          return nil unless object && object.owner_module == 'constructflow.library' && object.type == 'library.fixed_asset'
          object
        end

        def store(runtime)
          CatalogStore.new(runtime.active_model)
        end

        def install_ui(runtime, repository)
          menu = runtime.menu.add_submenu('Catalog Library')
          menu.add_item('Library Summary') do
            catalog = store(runtime)
            UI.messagebox(
              "ConstructFlow Catalog Library\nFolders: #{catalog.folder_count}\nAssets: #{catalog.asset_count}\nProject snapshots: #{catalog.snapshot_count}"
            )
          end
          menu.add_item('Place Fixed Asset by ID') do
            values = UI.inputbox(['Asset ID', 'Version (blank = latest)', 'Rotation (deg)'], ['', '', '0'], 'ConstructFlow Catalog Asset')
            next unless values
            asset_id = values[0].to_s.strip
            version = values[1].to_s.strip
            result = runtime.commands.execute(
              'PlaceCatalogAsset',
              {
                asset_id: asset_id,
                version: version.empty? ? nil : version,
                location_mm: [0, 0, 0],
                rotation_deg: Float(values[2])
              },
              project_id: runtime.project.project_id
            )
            UI.messagebox(result[:errors].join("\n")) unless result[:status] == 'success'
          end
        end
      end
    end
  end
end
