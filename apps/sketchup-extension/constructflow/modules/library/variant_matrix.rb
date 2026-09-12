# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Library
      class VariantMatrix
        SCHEMA_VERSION = 1

        attr_reader :asset_id, :axes, :variants

        def initialize(asset_id:, axes: {}, variants: [])
          @asset_id = asset_id.to_s
          @axes = normalize_hash(axes).freeze
          @variants = normalize_records(variants).freeze
          freeze
        end

        def errors
          result = []
          result << 'asset id required' if asset_id.empty?
          result << 'at least one variant required' if variants.empty?
          variants.each do |v|
            result << 'variant requires options hash' unless v['options'].is_a?(Hash)
            result << 'variant requires sku' if (v['sku'] || '').to_s.empty?
          end
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def resolve(requested_options)
          req = requested_options.transform_keys(&:to_s)
          # Exact match
          exact = variants.find do |v|
            v_opts = v['options'].transform_keys(&:to_s)
            req.all? { |k, val| v_opts[k] == val }
          end
          return exact if exact

          nil
        end

        def skus
          variants.map { |v| v['sku'] }.freeze
        end

        def available_values(axis_name)
          variants.map { |v| v['options'][axis_name.to_s] }.compact.uniq
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'asset_id' => asset_id,
            'axes' => axes,
            'variants' => variants
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            asset_id: data['asset_id'] || data[:asset_id],
            axes: data['axes'] || data[:axes] || {},
            variants: data['variants'] || data[:variants] || []
          )
        end

        private

        def normalize_records(records)
          Array(records).map { |r| normalize_hash(r).freeze }
        end

        def normalize_hash(h)
          return {} unless h.is_a?(Hash)

          h.each_with_object({}) do |(k, v), res|
            res[k.to_s] = v.is_a?(Hash) ? normalize_hash(v).freeze : v
          end
        end
      end
    end
  end
end
