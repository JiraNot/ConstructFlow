# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Library
      class CompatibilityEngine
        TOLERANCE_MM = 1.0
        SIGNIFICANT_DELTA_RATIO = 0.20

        def evaluate(source_asset:, candidate_asset:)
          raise ArgumentError, 'source_asset must be CatalogAssetDefinition' unless source_asset.is_a?(CatalogAssetDefinition)
          raise ArgumentError, 'candidate_asset must be CatalogAssetDefinition' unless candidate_asset.is_a?(CatalogAssetDefinition)

          blocking_reasons = []
          warnings = []

          # 1. Category Compatibility
          if source_asset.category != candidate_asset.category
            blocking_reasons << "Category mismatch: '#{source_asset.category}' cannot be replaced by '#{candidate_asset.category}'"
          end

          # 2. Host Compatibility
          if source_asset.host_capability && candidate_asset.host_capability && source_asset.host_capability != candidate_asset.host_capability
            blocking_reasons << "Host capability mismatch: requires '#{source_asset.host_capability}' but candidate requires '#{candidate_asset.host_capability}'"
          elsif candidate_asset.host_capability && source_asset.host_capability.nil?
            warnings << "Candidate asset requires host '#{candidate_asset.host_capability}' while source asset was unhosted"
          end

          # 3. Connector Compatibility
          src_connectors = source_asset.connector_capabilities
          cand_connectors = candidate_asset.connector_capabilities
          missing_connectors = src_connectors - cand_connectors
          added_connectors = cand_connectors - src_connectors

          unless missing_connectors.empty?
            warnings << "Candidate asset lacks source connector capabilities: #{missing_connectors.join(', ')}"
          end

          # 4. Dimensional Comparison
          dim_delta = nil
          max_ratio_diff = 0.0
          if source_asset.dimensions_mm && candidate_asset.dimensions_mm
            dim_delta = [
              (candidate_asset.dimensions_mm[0] - source_asset.dimensions_mm[0]).round(1),
              (candidate_asset.dimensions_mm[1] - source_asset.dimensions_mm[1]).round(1),
              (candidate_asset.dimensions_mm[2] - source_asset.dimensions_mm[2]).round(1)
            ]

            ratios = [
              (dim_delta[0].abs / source_asset.dimensions_mm[0]),
              (dim_delta[1].abs / source_asset.dimensions_mm[1]),
              (dim_delta[2].abs / source_asset.dimensions_mm[2])
            ]
            max_ratio_diff = ratios.max

            if max_ratio_diff > SIGNIFICANT_DELTA_RATIO
              warnings << format('Significant dimension difference: delta [%.1f, %.1f, %.1f] mm (%.1f%% max variation)',
                                 dim_delta[0], dim_delta[1], dim_delta[2], max_ratio_diff * 100.0)
            end
          end

          # 5. Replacement Workflow Recommendation
          recommended_workflow = if blocking_reasons.any?
                                   :incompatible
                                 elsif dim_delta && dim_delta.any? { |d| d.abs > TOLERANCE_MM }
                                   :replace_construction
                                 else
                                   :swap
                                 end

          # 6. Match Level
          match_level = if blocking_reasons.any?
                          :incompatible
                        elsif warnings.empty? && dim_delta && dim_delta.all? { |d| d.abs <= TOLERANCE_MM }
                          :exact
                        else
                          :compatible_with_warnings
                        end

          {
            compatible: blocking_reasons.empty?,
            match_level: match_level,
            recommended_workflow: recommended_workflow,
            generic_to_manufacturer: source_asset.generic? && candidate_asset.manufacturer_product?,
            dimensional_delta_mm: dim_delta,
            missing_connectors: missing_connectors,
            added_connectors: added_connectors,
            warnings: warnings,
            blocking_reasons: blocking_reasons
          }
        end
      end
    end
  end
end
