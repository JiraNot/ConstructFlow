# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Library
      class CatalogStore
        DICTIONARY = 'constructflow.library'
        FOLDERS_KEY = 'folders'
        ASSETS_KEY = 'assets'
        LATEST_KEY = 'latest_assets'
        SNAPSHOTS_KEY = 'project_snapshots'
        FAVORITES_KEY = 'favorites'
        RECENT_KEY = 'recent_assets'
        RECENT_LIMIT = 20

        def initialize(model = nil)
          @model = model
        end

        def attach_model(model)
          @model = model
          self
        end

        def create_folder(id:, name:, parent_id: nil)
          ensure_model!
          folder_id = id.to_s.strip
          folder_name = name.to_s.strip
          raise ArgumentError, 'folder id required' if folder_id.empty?
          raise ArgumentError, 'folder name required' if folder_name.empty?
          values = folders
          raise ArgumentError, "folder already exists: #{folder_id}" if values.key?(folder_id)
          if parent_id && !parent_id.to_s.empty? && !values.key?(parent_id.to_s)
            raise ArgumentError, "parent folder not found: #{parent_id}"
          end
          record = {
            'id' => folder_id,
            'name' => folder_name,
            'parent_id' => blank_to_nil(parent_id)
          }
          values[folder_id] = record
          write_json(FOLDERS_KEY, values)
          deep_freeze(record.dup)
        end

        def folder(id)
          value = folders.fetch(id.to_s)
          deep_freeze(value.dup)
        end

        def folder_path(id)
          current = folder(id)
          path = [current]
          guard = 0
          while current['parent_id']
            current = folder(current['parent_id'])
            path.unshift(current)
            guard += 1
            raise 'library folder cycle detected' if guard > 100
          end
          path.freeze
        end

        def register_asset(definition, folder_id: nil, replace_same_version: false)
          ensure_model!
          raise ArgumentError, 'CatalogAssetDefinition required' unless definition.is_a?(CatalogAssetDefinition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?
          folder(folder_id) if folder_id && !folder_id.to_s.empty?

          values = assets
          if values.key?(definition.key) && !replace_same_version
            raise ArgumentError, "catalog asset already exists: #{definition.key}"
          end
          values[definition.key] = {
            'definition' => definition.to_h,
            'folder_id' => blank_to_nil(folder_id)
          }
          write_json(ASSETS_KEY, values)
          latest = latest_assets
          latest[definition.asset_id] = definition.key
          write_json(LATEST_KEY, latest)
          definition
        end

        def asset(asset_id, version: nil)
          key = if version
                  "#{asset_id}@#{version}"
                else
                  latest_assets.fetch(asset_id.to_s)
                end
          value = assets.fetch(key)
          touch_recent(key)
          CatalogAssetDefinition.from_h(value['definition'])
        end

        def asset_record(asset_id, version: nil)
          definition = asset(asset_id, version: version)
          record = assets.fetch(definition.key)
          {
            'definition' => definition,
            'folder_id' => record['folder_id'],
            'favorite' => favorites.include?(definition.key)
          }.freeze
        end

        def versions(asset_id)
          prefix = "#{asset_id}@"
          assets.keys.select { |key| key.start_with?(prefix) }.map do |key|
            CatalogAssetDefinition.from_h(assets.fetch(key)['definition'])
          end.sort_by(&:version).freeze
        end

        def search(query: nil, category: nil, tags: nil, asset_class: nil,
                   manufacturer: nil, folder_id: nil, favorites_only: false)
          q = query.to_s.strip.downcase
          required_tags = Array(tags).map(&:to_s)
          result = assets.values.filter_map do |record|
            definition = CatalogAssetDefinition.from_h(record['definition'])
            next if !q.empty? && !definition.searchable_text.include?(q)
            next if category && definition.category != category.to_s
            next if asset_class && definition.asset_class != asset_class.to_s
            next if manufacturer && definition.manufacturer.to_s != manufacturer.to_s
            next if folder_id && record['folder_id'].to_s != folder_id.to_s
            next unless required_tags.all? { |tag| definition.tags.include?(tag) }
            next if favorites_only && !favorites.include?(definition.key)
            {
              'definition' => definition,
              'folder_id' => record['folder_id'],
              'favorite' => favorites.include?(definition.key)
            }.freeze
          end
          result.sort_by { |item| [item['definition'].category, item['definition'].name, item['definition'].version] }.freeze
        end

        def add_to_project_library(asset_id:, version: nil, pin: false, source_scope: 'company')
          definition = asset(asset_id, version: version)
          snapshot_id = "snapshot:#{definition.key}"
          values = snapshots
          snapshot = if values.key?(snapshot_id)
                       ProjectAssetSnapshot.from_h(values[snapshot_id]).with(pinned: pin || ProjectAssetSnapshot.from_h(values[snapshot_id]).pinned)
                     else
                       ProjectAssetSnapshot.new(
                         snapshot_id: snapshot_id,
                         asset_id: definition.asset_id,
                         asset_version: definition.version,
                         asset_payload: definition.to_h,
                         pinned: pin,
                         source_scope: source_scope
                       )
                     end
          raise ArgumentError, snapshot.errors.join('; ') unless snapshot.valid?
          values[snapshot_id] = snapshot.to_h
          write_json(SNAPSHOTS_KEY, values)
          snapshot
        end

        def project_snapshot(snapshot_id)
          ProjectAssetSnapshot.from_h(snapshots.fetch(snapshot_id.to_s))
        end

        def project_snapshot_for(asset_id:, version: nil)
          definition = asset(asset_id, version: version)
          snapshot_id = "snapshot:#{definition.key}"
          values = snapshots
          values.key?(snapshot_id) ? ProjectAssetSnapshot.from_h(values[snapshot_id]) : nil
        end

        def record_placement(snapshot_id:, object_id:)
          values = snapshots
          current = ProjectAssetSnapshot.from_h(values.fetch(snapshot_id.to_s))
          updated = current.add_placed_object(object_id)
          values[updated.snapshot_id] = updated.to_h
          write_json(SNAPSHOTS_KEY, values)
          updated
        end

        def pin_snapshot(snapshot_id, pinned: true)
          values = snapshots
          current = ProjectAssetSnapshot.from_h(values.fetch(snapshot_id.to_s))
          updated = current.with(pinned: pinned)
          values[updated.snapshot_id] = updated.to_h
          write_json(SNAPSHOTS_KEY, values)
          updated
        end

        def favorite(asset_id:, version: nil, value: true)
          definition = asset(asset_id, version: version)
          values = favorites
          if value
            values << definition.key unless values.include?(definition.key)
          else
            values.delete(definition.key)
          end
          write_json(FAVORITES_KEY, values)
          value
        end

        def recent
          recent_keys.filter_map do |key|
            record = assets[key]
            record && CatalogAssetDefinition.from_h(record['definition'])
          end.freeze
        end

        def folder_count
          folders.length
        end

        def asset_count
          assets.length
        end

        def snapshot_count
          snapshots.length
        end

        private

        def ensure_model!
          raise 'CatalogStore is not attached to a model' unless @model
        end

        def folders
          normalize_hash(read_json(FOLDERS_KEY, {}))
        end

        def assets
          normalize_hash(read_json(ASSETS_KEY, {}))
        end

        def latest_assets
          normalize_hash(read_json(LATEST_KEY, {}))
        end

        def snapshots
          normalize_hash(read_json(SNAPSHOTS_KEY, {}))
        end

        def favorites
          Array(read_json(FAVORITES_KEY, [])).map(&:to_s)
        end

        def recent_keys
          Array(read_json(RECENT_KEY, [])).map(&:to_s)
        end

        def touch_recent(key)
          values = recent_keys
          values.delete(key.to_s)
          values.unshift(key.to_s)
          write_json(RECENT_KEY, values.first(RECENT_LIMIT))
        end

        def read_json(key, default)
          Core::AttributeStore.new(@model).read_json(key, default, dictionary: DICTIONARY) || default
        end

        def write_json(key, value)
          Core::AttributeStore.new(@model).write_json(key, value, dictionary: DICTIONARY)
        end

        def normalize_hash(value)
          (value || {}).each_with_object({}) do |(key, item), result|
            result[key.to_s] = item.is_a?(Hash) ? normalize_hash(item) : item
          end
        end

        def blank_to_nil(value)
          text = value&.to_s
          text.nil? || text.empty? ? nil : text
        end

        def deep_freeze(value)
          case value
          when Hash
            value.each { |key, item| deep_freeze(key); deep_freeze(item) }
          when Array
            value.each { |item| deep_freeze(item) }
          end
          value.freeze
        end
      end
    end
  end
end
