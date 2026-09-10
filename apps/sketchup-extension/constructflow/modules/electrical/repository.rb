# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      class Repository
        DICTIONARY = 'constructflow.electrical'
        DEVICE_KEY = 'device_definition'
        CIRCUITS_KEY = 'circuits'
        CONTROLS_KEY = 'control_relations'

        def read_device(entity)
          payload = Core::AttributeStore.new(entity).read_json(DEVICE_KEY, nil, dictionary: DICTIONARY)
          payload ? DeviceDefinition.from_h(payload) : nil
        end

        def write_device(entity, definition)
          raise ArgumentError, 'DeviceDefinition required' unless definition.is_a?(DeviceDefinition)
          Core::AttributeStore.new(entity).write_json(DEVICE_KEY, definition.to_h, dictionary: DICTIONARY)
          definition
        end

        def circuits(model)
          raw = Core::AttributeStore.new(model).read_json(CIRCUITS_KEY, {}, dictionary: DICTIONARY) || {}
          raw.each_with_object({}) { |(id, value), result| result[id.to_s] = CircuitDefinition.from_h(value) }
        end

        def write_circuit(model, definition)
          raise ArgumentError, 'CircuitDefinition required' unless definition.is_a?(CircuitDefinition)
          values = circuits(model).transform_values(&:to_h)
          values[definition.id] = definition.to_h
          Core::AttributeStore.new(model).write_json(CIRCUITS_KEY, values, dictionary: DICTIONARY)
          definition
        end

        def circuit(model, id)
          circuits(model)[id.to_s]
        end

        def control_relations(model)
          Array(Core::AttributeStore.new(model).read_json(CONTROLS_KEY, [], dictionary: DICTIONARY))
        end

        def add_control_relation(model, switch_object_id:, load_object_ids:)
          relation = {
            'switch_object_id' => switch_object_id.to_s,
            'load_object_ids' => Array(load_object_ids).map(&:to_s).reject(&:empty?).uniq
          }
          values = control_relations(model).reject { |item| item['switch_object_id'].to_s == relation['switch_object_id'] }
          values << relation
          Core::AttributeStore.new(model).write_json(CONTROLS_KEY, values, dictionary: DICTIONARY)
          relation.freeze
        end
      end
    end
  end
end
