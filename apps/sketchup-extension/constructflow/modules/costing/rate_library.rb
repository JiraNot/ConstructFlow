# frozen_string_literal: true

require_relative 'rate_item'

module JiraNot
  module ConstructFlow
    module Costing
      class RateLibrary
        SCHEMA_VERSION = 1

        attr_reader :id, :name, :version, :currency, :effective_date, :items

        def initialize(id:, name:, version: 1, currency: 'THB',
                       effective_date: Time.now.strftime('%Y-%m-%d'), items: {})
          @id = id.to_s.strip
          @name = name.to_s.strip
          @version = version.to_s.strip
          @currency = currency.to_s.strip.upcase
          @effective_date = effective_date.to_s.strip
          @items = normalize_items(items).freeze
          freeze
        end

        def errors
          result = []
          result << 'library id required' if id.empty?
          result << 'library name required' if name.empty?
          result << 'library version required' if version.empty?
          result << 'library currency required' if currency.empty?
          items.each_value do |item|
            result.concat(item.errors) unless item.valid?
          end
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def find_rate(classification)
          items[classification.to_s.strip]
        end

        def add_or_update_item(item)
          raise ArgumentError, 'RateItem required' unless item.is_a?(RateItem)
          raise ArgumentError, item.errors.join('; ') unless item.valid?

          updated_items = items.dup
          updated_items[item.classification] = item
          self.class.new(
            id: id,
            name: name,
            version: version,
            currency: currency,
            effective_date: effective_date,
            items: updated_items
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'id' => id,
            'name' => name,
            'version' => version,
            'currency' => currency,
            'effective_date' => effective_date,
            'items' => items.transform_values(&:to_h)
          }
        end

        def self.from_h(value)
          data = value || {}
          raw_items = data['items'] || data[:items] || {}
          parsed_items = raw_items.transform_values { |v| RateItem.from_h(v) }
          new(
            id: data['id'] || data[:id],
            name: data['name'] || data[:name],
            version: data['version'] || data[:version] || 1,
            currency: data['currency'] || data[:currency] || 'THB',
            effective_date: data['effective_date'] || data[:effective_date] || Time.now.strftime('%Y-%m-%d'),
            items: parsed_items
          )
        end

        private

        def normalize_items(values)
          (values || {}).each_with_object({}) do |(k, v), result|
            item = v.is_a?(RateItem) ? v : RateItem.from_h(v)
            result[k.to_s.strip] = item
          end
        end
      end
    end
  end
end
