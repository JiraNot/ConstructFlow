# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Library
      class ProjectAssetSnapshot
        SCHEMA_VERSION = 1

        attr_reader :snapshot_id, :asset_id, :asset_version, :asset_payload,
                    :pinned, :source_scope, :placed_object_ids

        def initialize(snapshot_id:, asset_id:, asset_version:, asset_payload:,
                       pinned: false, source_scope: 'company', placed_object_ids: [])
          @snapshot_id = snapshot_id.to_s
          @asset_id = asset_id.to_s
          @asset_version = asset_version.to_s
          @asset_payload = normalize_hash(asset_payload).freeze
          @pinned = !!pinned
          @source_scope = source_scope.to_s
          @placed_object_ids = Array(placed_object_ids).map(&:to_s).uniq.freeze
          freeze
        end

        def errors
          result = []
          result << 'snapshot id required' if snapshot_id.empty?
          result << 'snapshot asset id required' if asset_id.empty?
          result << 'snapshot asset version required' if asset_version.empty?
          result << 'snapshot asset payload required' if asset_payload.empty?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def asset_definition
          CatalogAssetDefinition.from_h(asset_payload)
        end

        def with(pinned: self.pinned, placed_object_ids: self.placed_object_ids)
          self.class.new(
            snapshot_id: snapshot_id,
            asset_id: asset_id,
            asset_version: asset_version,
            asset_payload: asset_payload,
            pinned: pinned,
            source_scope: source_scope,
            placed_object_ids: placed_object_ids
          )
        end

        def add_placed_object(object_id)
          with(placed_object_ids: placed_object_ids + [object_id.to_s])
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'snapshot_id' => snapshot_id,
            'asset_id' => asset_id,
            'asset_version' => asset_version,
            'asset_payload' => asset_payload,
            'pinned' => pinned,
            'source_scope' => source_scope,
            'placed_object_ids' => placed_object_ids
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            snapshot_id: data['snapshot_id'] || data[:snapshot_id],
            asset_id: data['asset_id'] || data[:asset_id],
            asset_version: data['asset_version'] || data[:asset_version],
            asset_payload: data['asset_payload'] || data[:asset_payload] || {},
            pinned: data['pinned'] || data[:pinned] || false,
            source_scope: data['source_scope'] || data[:source_scope] || 'company',
            placed_object_ids: data['placed_object_ids'] || data[:placed_object_ids] || []
          )
        end

        private

        def normalize_hash(value)
          (value || {}).each_with_object({}) do |(key, item), result|
            result[key.to_s] = case item
                               when Hash then normalize_hash(item).freeze
                               when Array then item.map { |entry| entry.is_a?(Hash) ? normalize_hash(entry).freeze : entry }.freeze
                               else item
                               end
          end
        end
      end
    end
  end
end
