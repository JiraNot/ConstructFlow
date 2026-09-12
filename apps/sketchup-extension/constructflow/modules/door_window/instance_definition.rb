# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      class InstanceDefinition
        SCHEMA_VERSION = 1

        attr_reader :type_id, :opening_object_id, :handing, :schedule_mark, :parameters

        def initialize(type_id:, opening_object_id:, handing: 'default', schedule_mark: nil, parameters: {})
          @type_id = type_id.to_s
          @opening_object_id = opening_object_id.to_s
          @handing = handing.to_s
          @schedule_mark = schedule_mark&.to_s
          @parameters = (parameters || {}).each_with_object({}) { |(key, value), result| result[key.to_s] = value }.freeze
          freeze
        end

        def errors
          result = []
          result << 'door/window type id required' if type_id.strip.empty?
          result << 'opening object id required' if opening_object_id.strip.empty?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def with(type_id: self.type_id, opening_object_id: self.opening_object_id,
                 handing: self.handing, schedule_mark: self.schedule_mark, parameters: self.parameters)
          self.class.new(
            type_id: type_id,
            opening_object_id: opening_object_id,
            handing: handing,
            schedule_mark: schedule_mark,
            parameters: parameters
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'type_id' => type_id,
            'opening_object_id' => opening_object_id,
            'handing' => handing,
            'schedule_mark' => schedule_mark,
            'parameters' => parameters
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            type_id: data['type_id'] || data[:type_id],
            opening_object_id: data['opening_object_id'] || data[:opening_object_id],
            handing: data['handing'] || data[:handing] || 'default',
            schedule_mark: data['schedule_mark'] || data[:schedule_mark],
            parameters: data['parameters'] || data[:parameters] || {}
          )
        end
      end
    end
  end
end
