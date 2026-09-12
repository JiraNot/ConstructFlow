# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Costing
      class RateItem
        CANONICAL_UNITS = %w[m m2 m3 kg pcs pair sheet set lot].freeze

        attr_reader :classification, :description, :unit, :material_rate,
                    :labor_rate, :equipment_rate, :default_waste_pct, :currency

        def initialize(classification:, description:, unit:,
                       material_rate: 0.0, labor_rate: 0.0, equipment_rate: 0.0,
                       default_waste_pct: 0.0, currency: 'THB')
          @classification = classification.to_s.strip
          @description = description.to_s.strip
          @unit = unit.to_s.strip.downcase
          @material_rate = Float(material_rate)
          @labor_rate = Float(labor_rate)
          @equipment_rate = Float(equipment_rate)
          @default_waste_pct = Float(default_waste_pct)
          @currency = currency.to_s.strip.upcase
          freeze
        end

        def errors
          result = []
          result << 'classification required' if classification.empty?
          result << 'description required' if description.empty?
          result << 'unit required' if unit.empty?
          result << "unsupported unit: #{unit}" unless CANONICAL_UNITS.include?(unit)
          result << 'material rate cannot be negative' if material_rate.negative?
          result << 'labor rate cannot be negative' if labor_rate.negative?
          result << 'equipment rate cannot be negative' if equipment_rate.negative?
          result << 'default waste pct cannot be negative' if default_waste_pct.negative?
          result << 'currency required' if currency.empty?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def unit_rate
          material_rate + labor_rate + equipment_rate
        end

        def to_h
          {
            'classification' => classification,
            'description' => description,
            'unit' => unit,
            'material_rate' => material_rate,
            'labor_rate' => labor_rate,
            'equipment_rate' => equipment_rate,
            'default_waste_pct' => default_waste_pct,
            'currency' => currency,
            'unit_rate' => unit_rate
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            classification: data['classification'] || data[:classification],
            description: data['description'] || data[:description],
            unit: data['unit'] || data[:unit],
            material_rate: data['material_rate'] || data[:material_rate] || 0.0,
            labor_rate: data['labor_rate'] || data[:labor_rate] || 0.0,
            equipment_rate: data['equipment_rate'] || data[:equipment_rate] || 0.0,
            default_waste_pct: data['default_waste_pct'] || data[:default_waste_pct] || 0.0,
            currency: data['currency'] || data[:currency] || 'THB'
          )
        end
      end
    end
  end
end
