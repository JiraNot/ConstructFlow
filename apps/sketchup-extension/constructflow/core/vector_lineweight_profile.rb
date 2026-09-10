# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class VectorLineweightProfile
        DEFAULT_WEIGHTS_MM = {
          'light' => 0.13,
          'normal' => 0.18,
          'medium' => 0.25,
          'strong' => 0.35
        }.freeze

        attr_reader :id, :weights_mm

        def initialize(id: 'construction', weights_mm: DEFAULT_WEIGHTS_MM)
          @id = id.to_s
          raise ArgumentError, 'lineweight profile id required' if @id.empty?

          @weights_mm = stringify_keys(weights_mm || {}).each_with_object({}) do |(key, value), result|
            width = Float(value)
            raise ArgumentError, "lineweight must be positive: #{key}" unless width.positive?
            result[key] = width
          end.freeze
          raise ArgumentError, 'lineweight profile must define light/normal/medium/strong' unless DEFAULT_WEIGHTS_MM.keys.all? { |key| @weights_mm.key?(key) }
          freeze
        end

        def width_mm(weight_key)
          weights_mm.fetch(weight_key.to_s) { weights_mm.fetch('normal') }
        end

        def to_h
          { 'id' => id, 'weights_mm' => weights_mm }.freeze
        end

        private

        def stringify_keys(value)
          value.each_with_object({}) { |(key, item), result| result[key.to_s] = item }
        end
      end
    end
  end
end
