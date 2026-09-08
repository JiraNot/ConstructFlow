# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Library
      class PlacedAssetDefinition
        SCHEMA_VERSION = 1

        attr_reader :snapshot_id, :asset_id, :asset_version, :location_mm,
                    :rotation_deg, :dimensions_mm, :lod_key, :variant_state

        def initialize(snapshot_id:, asset_id:, asset_version:, location_mm:,
                       rotation_deg: 0, dimensions_mm: nil, lod_key: 'design',
                       variant_state: {})
          @snapshot_id = snapshot_id.to_s
          @asset_id = asset_id.to_s
          @asset_version = asset_version.to_s
          @location_mm = normalize_point(location_mm).freeze
          @rotation_deg = Float(rotation_deg)
          @dimensions_mm = normalize_dimensions(dimensions_mm)&.freeze
          @lod_key = lod_key.to_s
          @variant_state = normalize_hash(variant_state).freeze
          freeze
        end

        def errors
          result = []
          result << 'placed asset snapshot id required' if snapshot_id.empty?
          result << 'placed asset id required' if asset_id.empty?
          result << 'placed asset version required' if asset_version.empty?
          result << 'unsupported LOD key' unless CatalogAssetDefinition::LOD_KEYS.include?(lod_key)
          if dimensions_mm && dimensions_mm.any? { |value| value <= 0 }
            result << 'placed asset dimensions must be positive'
          end
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def with(snapshot_id: self.snapshot_id, asset_id: self.asset_id,
                 asset_version: self.asset_version, location_mm: self.location_mm,
                 rotation_deg: self.rotation_deg, dimensions_mm: self.dimensions_mm,
                 lod_key: self.lod_key, variant_state: self.variant_state)
          self.class.new(
            snapshot_id: snapshot_id,
            asset_id: asset_id,
            asset_version: asset_version,
            location_mm: location_mm,
            rotation_deg: rotation_deg,
            dimensions_mm: dimensions_mm,
            lod_key: lod_key,
            variant_state: variant_state
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'snapshot_id' => snapshot_id,
            'asset_id' => asset_id,
            'asset_version' => asset_version,
            'location_mm' => location_mm,
            'rotation_deg' => rotation_deg,
            'dimensions_mm' => dimensions_mm,
            'lod_key' => lod_key,
            'variant_state' => variant_state
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            snapshot_id: data['snapshot_id'] || data[:snapshot_id],
            asset_id: data['asset_id'] || data[:asset_id],
            asset_version: data['asset_version'] || data[:asset_version],
            location_mm: data['location_mm'] || data[:location_mm] || [0, 0, 0],
            rotation_deg: data['rotation_deg'] || data[:rotation_deg] || 0,
            dimensions_mm: data['dimensions_mm'] || data[:dimensions_mm],
            lod_key: data['lod_key'] || data[:lod_key] || 'design',
            variant_state: data['variant_state'] || data[:variant_state] || {}
          )
        end

        private

        def normalize_point(value)
          values = Array(value)
          raise ArgumentError, 'placed asset location requires x, y, z' unless values.length >= 3
          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

        def normalize_dimensions(value)
          return nil if value.nil?
          values = Array(value)
          raise ArgumentError, 'placed asset dimensions require width, depth, height' unless values.length >= 3
          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

        def normalize_hash(value)
          (value || {}).each_with_object({}) { |(key, item), result| result[key.to_s] = item }
        end
      end
    end
  end
end
