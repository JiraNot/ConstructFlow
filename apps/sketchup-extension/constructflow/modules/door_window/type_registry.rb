# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      class TypeRegistry
        DICTIONARY = 'constructflow.door_window'
        TYPES_KEY = 'types'

        def initialize(model)
          @model = model
        end

        def register(type, replace: false)
          raise ArgumentError, 'DoorWindowType required' unless type.is_a?(DoorWindowType)
          raise ArgumentError, type.errors.join('; ') unless type.valid?

          values = raw_types
          if values.key?(type.id) && !replace
            raise ArgumentError, "door/window type already exists: #{type.id}"
          end
          values[type.id] = type.to_h
          write_types(values)
          type
        end

        def fetch(type_id)
          payload = raw_types.fetch(type_id.to_s)
          DoorWindowType.from_h(payload)
        end

        def registered?(type_id)
          raw_types.key?(type_id.to_s)
        end

        def all
          raw_types.keys.sort.map { |id| fetch(id) }.freeze
        end

        def update(type_id)
          current = fetch(type_id)
          updated = yield(current)
          raise ArgumentError, 'DoorWindowType required' unless updated.is_a?(DoorWindowType)
          raise ArgumentError, 'type id cannot change during update' unless updated.id == current.id

          register(updated, replace: true)
        end

        def size
          raw_types.size
        end

        private

        def raw_types
          value = Core::AttributeStore.new(@model).read_json(
            TYPES_KEY,
            {},
            dictionary: DICTIONARY
          )
          (value || {}).each_with_object({}) do |(key, item), result|
            result[key.to_s] = item
          end
        end

        def write_types(values)
          Core::AttributeStore.new(@model).write_json(
            TYPES_KEY,
            values,
            dictionary: DICTIONARY
          )
        end
      end
    end
  end
end
