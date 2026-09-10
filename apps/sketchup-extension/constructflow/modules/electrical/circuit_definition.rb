# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      class CircuitDefinition
        SCHEMA_VERSION = 1

        attr_reader :id, :name, :panel_ref, :circuit_type, :device_object_ids, :rating_a

        def initialize(id:, name:, circuit_type: 'general', panel_ref: nil, device_object_ids: [], rating_a: nil)
          @id = required(id, 'circuit id')
          @name = required(name, 'circuit name')
          @circuit_type = required(circuit_type, 'circuit_type')
          @panel_ref = panel_ref&.to_s
          @device_object_ids = Array(device_object_ids).map(&:to_s).reject(&:empty?).uniq.freeze
          @rating_a = rating_a.nil? ? nil : Float(rating_a)
          freeze
        end

        def errors
          result = []
          result << 'circuit rating must be positive' if rating_a && !rating_a.positive?
          result.freeze
        end

        def valid? = errors.empty?

        def with_devices(ids)
          self.class.new(id: id, name: name, circuit_type: circuit_type, panel_ref: panel_ref,
                         device_object_ids: ids, rating_a: rating_a)
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'id' => id,
            'name' => name,
            'circuit_type' => circuit_type,
            'panel_ref' => panel_ref,
            'device_object_ids' => device_object_ids,
            'rating_a' => rating_a
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            id: data['id'] || data[:id],
            name: data['name'] || data[:name] || data['id'] || data[:id],
            circuit_type: data['circuit_type'] || data[:circuit_type] || 'general',
            panel_ref: data['panel_ref'] || data[:panel_ref],
            device_object_ids: data['device_object_ids'] || data[:device_object_ids] || [],
            rating_a: data['rating_a'] || data[:rating_a]
          )
        end

        private

        def required(value, label)
          text = value.to_s
          raise ArgumentError, "#{label} required" if text.empty?
          text
        end
      end
    end
  end
end
