# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      class DeviceDefinition
        SCHEMA_VERSION = 1
        KINDS = %w[luminaire switch outlet data tv dedicated_outlet].freeze
        MOUNTINGS = %w[ceiling wall floor surface pendant path landscape].freeze

        attr_reader :kind, :device_type, :position_mm, :mounting, :host_object_id,
                    :level_id, :mounting_height_mm, :catalog_ref, :wattage,
                    :cct_k, :circuit_id, :control_group_id, :dedicated,
                    :weatherproof, :appliance_ref, :schedule_mark

        def initialize(kind:, device_type:, position_mm:, mounting:, host_object_id: nil,
                       level_id: nil, mounting_height_mm: 0, catalog_ref: nil,
                       wattage: nil, cct_k: nil, circuit_id: nil, control_group_id: nil,
                       dedicated: false, weatherproof: false, appliance_ref: nil,
                       schedule_mark: nil)
          @kind = kind.to_s
          @device_type = required(device_type, 'device_type')
          @position_mm = normalize_point(position_mm).freeze
          @mounting = mounting.to_s
          @host_object_id = host_object_id&.to_s
          @level_id = level_id&.to_s
          @mounting_height_mm = Float(mounting_height_mm)
          @catalog_ref = catalog_ref&.to_s
          @wattage = wattage.nil? ? nil : Float(wattage)
          @cct_k = cct_k.nil? ? nil : Integer(cct_k)
          @circuit_id = circuit_id&.to_s
          @control_group_id = control_group_id&.to_s
          @dedicated = dedicated == true
          @weatherproof = weatherproof == true
          @appliance_ref = appliance_ref&.to_s
          @schedule_mark = schedule_mark&.to_s
          freeze
        end

        def errors
          result = []
          result << 'unsupported electrical device kind' unless KINDS.include?(kind)
          result << 'unsupported electrical mounting' unless MOUNTINGS.include?(mounting)
          result << 'wattage cannot be negative' if wattage && wattage.negative?
          result << 'CCT must be positive' if cct_k && cct_k <= 0
          result.freeze
        end

        def valid? = errors.empty?

        def with(**changes)
          self.class.new(**to_h.transform_keys(&:to_sym).merge(changes).reject { |key, _| key == :schema_version })
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'kind' => kind,
            'device_type' => device_type,
            'position_mm' => position_mm,
            'mounting' => mounting,
            'host_object_id' => host_object_id,
            'level_id' => level_id,
            'mounting_height_mm' => mounting_height_mm,
            'catalog_ref' => catalog_ref,
            'wattage' => wattage,
            'cct_k' => cct_k,
            'circuit_id' => circuit_id,
            'control_group_id' => control_group_id,
            'dedicated' => dedicated,
            'weatherproof' => weatherproof,
            'appliance_ref' => appliance_ref,
            'schedule_mark' => schedule_mark
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            kind: data['kind'] || data[:kind] || 'outlet',
            device_type: data['device_type'] || data[:device_type] || 'generic',
            position_mm: data['position_mm'] || data[:position_mm] || [0, 0, 0],
            mounting: data['mounting'] || data[:mounting] || 'wall',
            host_object_id: data['host_object_id'] || data[:host_object_id],
            level_id: data['level_id'] || data[:level_id],
            mounting_height_mm: data['mounting_height_mm'] || data[:mounting_height_mm] || 0,
            catalog_ref: data['catalog_ref'] || data[:catalog_ref],
            wattage: data['wattage'] || data[:wattage],
            cct_k: data['cct_k'] || data[:cct_k],
            circuit_id: data['circuit_id'] || data[:circuit_id],
            control_group_id: data['control_group_id'] || data[:control_group_id],
            dedicated: data['dedicated'] == true || data[:dedicated] == true,
            weatherproof: data['weatherproof'] == true || data[:weatherproof] == true,
            appliance_ref: data['appliance_ref'] || data[:appliance_ref],
            schedule_mark: data['schedule_mark'] || data[:schedule_mark]
          )
        end

        private

        def normalize_point(value)
          values = Array(value)
          raise ArgumentError, 'electrical device position requires x, y, z' unless values.length >= 3
          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

        def required(value, label)
          text = value.to_s
          raise ArgumentError, "#{label} required" if text.empty?
          text
        end
      end
    end
  end
end
