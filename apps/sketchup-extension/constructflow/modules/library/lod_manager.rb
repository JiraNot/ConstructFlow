# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Library
      class LodManager
        def switch_lod(placed_asset:, target_lod:, catalog_asset: nil)
          raise ArgumentError, 'placed_asset required' unless placed_asset.is_a?(PlacedAssetDefinition)
          target = target_lod.to_s.strip.downcase
          raise ArgumentError, "unsupported LOD key: #{target}" unless CatalogAssetDefinition::LOD_KEYS.include?(target)

          effective_lod = target
          if catalog_asset && !catalog_asset.lod.empty?
            # Fallback to closest available if target LOD is not defined on asset
            unless catalog_asset.lod.key?(target)
              effective_lod = catalog_asset.lod.key?('design') ? 'design' : catalog_asset.lod.keys.first
            end
          end

          placed_asset.with(lod_key: effective_lod)
        end

        def available_lods(catalog_asset)
          return CatalogAssetDefinition::LOD_KEYS if catalog_asset.nil? || catalog_asset.lod.empty?

          catalog_asset.lod.keys & CatalogAssetDefinition::LOD_KEYS
        end
      end
    end
  end
end
