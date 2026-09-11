# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      # Resolves versioned rainwater hydraulic capacity evidence through the
      # public Library catalog capability. The Roof module consumes normalized
      # values only; it does not read Library persistence directly.
      class RainwaterCapacityProfileResolver
        CATALOG_CAPABILITY = 'library.catalog'
        CATEGORY = 'roof.rainwater_capacity'
        VERIFICATION_STATUS = 'verified'

        def resolve(runtime:, asset_id:, version: nil)
          id = asset_id.to_s.strip
          raise ArgumentError, 'capacity asset id required' if id.empty?
          unless runtime.capabilities.available?(CATALOG_CAPABILITY)
            raise ArgumentError, 'library catalog capability unavailable'
          end

          asset = runtime.capabilities.fetch(CATALOG_CAPABILITY).asset(id, version: blank_to_nil(version))
          raise ArgumentError, "rainwater capacity asset category must be #{CATEGORY}" unless asset.category == CATEGORY

          hydraulic = asset.metadata['hydraulic'] || {}
          verification = hydraulic['verification_status'].to_s
          unless verification == VERIFICATION_STATUS
            raise ArgumentError, 'rainwater capacity asset must be verified before use in planning'
          end

          capacity = positive_float(hydraulic['outlet_capacity_lps'], 'catalog outlet capacity')
          basis_ref = hydraulic['basis_ref'].to_s.strip
          raise ArgumentError, 'verified rainwater capacity asset requires hydraulic basis_ref' if basis_ref.empty?

          diameter = optional_positive_float(hydraulic['downpipe_diameter_mm'], 'catalog downpipe diameter')
          gutter_profile_id = blank_to_nil(hydraulic['gutter_profile_id'])

          {
            'kind' => 'catalog_asset',
            'asset_id' => asset.asset_id,
            'asset_version' => asset.version,
            'asset_name' => asset.name,
            'manufacturer' => blank_to_nil(asset.manufacturer),
            'product' => blank_to_nil(asset.product),
            'sku' => blank_to_nil(asset.sku),
            'verification_status' => verification,
            'basis_ref' => basis_ref,
            'outlet_capacity_lps' => capacity,
            'downpipe_diameter_mm' => diameter,
            'gutter_profile_id' => gutter_profile_id
          }.freeze
        rescue KeyError
          raise ArgumentError, "rainwater capacity asset not found: #{id}"
        end

        private

        def positive_float(value, label)
          number = Float(value)
          raise ArgumentError, "#{label} must be greater than zero" unless number.positive?
          number
        rescue TypeError, ArgumentError
          raise ArgumentError, "#{label} must be greater than zero"
        end

        def optional_positive_float(value, label)
          return nil if value.nil? || value.to_s.strip.empty?
          positive_float(value, label)
        end

        def blank_to_nil(value)
          text = value&.to_s
          text.nil? || text.strip.empty? ? nil : text
        end
      end
    end
  end
end
