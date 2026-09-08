# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Library
      class CatalogAssetDefinition
        SCHEMA_VERSION = 1
        ASSET_CLASSES = %w[fixed_asset parametric_asset assembly detail material product].freeze
        LOD_KEYS = %w[symbol low design high construction].freeze

        attr_reader :asset_id, :version, :name, :asset_class, :category, :subcategory,
                    :owner_module, :family, :variant, :tags, :dimensions_mm,
                    :parameter_schema, :host_capability, :connector_capabilities,
                    :manufacturer, :product, :sku, :quantity_unit, :lod,
                    :placement_command, :metadata

        def initialize(asset_id:, version:, name:, asset_class:, category:,
                       subcategory: nil, owner_module: 'constructflow.library',
                       family: nil, variant: nil, tags: [], dimensions_mm: nil,
                       parameter_schema: {}, host_capability: nil,
                       connector_capabilities: [], manufacturer: nil,
                       product: nil, sku: nil, quantity_unit: 'pcs', lod: {},
                       placement_command: nil, metadata: {})
          @asset_id = asset_id.to_s
          @version = version.to_s
          @name = name.to_s
          @asset_class = asset_class.to_s
          @category = category.to_s
          @subcategory = subcategory&.to_s
          @owner_module = owner_module.to_s
          @family = family&.to_s
          @variant = variant&.to_s
          @tags = Array(tags).map(&:to_s).uniq.sort.freeze
          @dimensions_mm = normalize_dimensions(dimensions_mm)&.freeze
          @parameter_schema = normalize_hash(parameter_schema).freeze
          @host_capability = host_capability&.to_s
          @connector_capabilities = Array(connector_capabilities).map(&:to_s).uniq.freeze
          @manufacturer = manufacturer&.to_s
          @product = product&.to_s
          @sku = sku&.to_s
          @quantity_unit = quantity_unit.to_s
          @lod = normalize_hash(lod).freeze
          @placement_command = placement_command&.to_s
          @metadata = normalize_hash(metadata).freeze
          freeze
        end

        def errors
          result = []
          result << 'asset id required' if asset_id.empty?
          result << 'asset version required' if version.empty?
          result << 'asset name required' if name.empty?
          result << 'asset category required' if category.empty?
          result << 'asset owner module required' if owner_module.empty?
          result << 'unsupported asset class' unless ASSET_CLASSES.include?(asset_class)
          result << 'quantity unit required' if quantity_unit.empty?
          if dimensions_mm && dimensions_mm.any? { |value| value <= 0 }
            result << 'asset dimensions must be positive'
          end
          unknown_lod = lod.keys - LOD_KEYS
          result << "unsupported LOD keys: #{unknown_lod.join(', ')}" unless unknown_lod.empty?
          if asset_class == 'parametric_asset' && placement_command.to_s.empty?
            result << 'parametric asset requires placement command'
          end
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def key
          "#{asset_id}@#{version}"
        end

        def generic?
          manufacturer.to_s.empty? && sku.to_s.empty?
        end

        def manufacturer_product?
          !manufacturer.to_s.empty? || !sku.to_s.empty?
        end

        def searchable_text
          [name, category, subcategory, family, variant, manufacturer, product, sku, *tags]
            .compact.join(' ').downcase
        end

        def fixed_asset?
          asset_class == 'fixed_asset'
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'asset_id' => asset_id,
            'version' => version,
            'name' => name,
            'asset_class' => asset_class,
            'category' => category,
            'subcategory' => subcategory,
            'owner_module' => owner_module,
            'family' => family,
            'variant' => variant,
            'tags' => tags,
            'dimensions_mm' => dimensions_mm,
            'parameter_schema' => parameter_schema,
            'host_capability' => host_capability,
            'connector_capabilities' => connector_capabilities,
            'manufacturer' => manufacturer,
            'product' => product,
            'sku' => sku,
            'quantity_unit' => quantity_unit,
            'lod' => lod,
            'placement_command' => placement_command,
            'metadata' => metadata
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            asset_id: data['asset_id'] || data[:asset_id],
            version: data['version'] || data[:version],
            name: data['name'] || data[:name],
            asset_class: data['asset_class'] || data[:asset_class],
            category: data['category'] || data[:category],
            subcategory: data['subcategory'] || data[:subcategory],
            owner_module: data['owner_module'] || data[:owner_module] || 'constructflow.library',
            family: data['family'] || data[:family],
            variant: data['variant'] || data[:variant],
            tags: data['tags'] || data[:tags] || [],
            dimensions_mm: data['dimensions_mm'] || data[:dimensions_mm],
            parameter_schema: data['parameter_schema'] || data[:parameter_schema] || {},
            host_capability: data['host_capability'] || data[:host_capability],
            connector_capabilities: data['connector_capabilities'] || data[:connector_capabilities] || [],
            manufacturer: data['manufacturer'] || data[:manufacturer],
            product: data['product'] || data[:product],
            sku: data['sku'] || data[:sku],
            quantity_unit: data['quantity_unit'] || data[:quantity_unit] || 'pcs',
            lod: data['lod'] || data[:lod] || {},
            placement_command: data['placement_command'] || data[:placement_command],
            metadata: data['metadata'] || data[:metadata] || {}
          )
        end

        private

        def normalize_dimensions(value)
          return nil if value.nil?
          values = Array(value)
          raise ArgumentError, 'asset dimensions require width, depth, height' unless values.length >= 3
          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

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
