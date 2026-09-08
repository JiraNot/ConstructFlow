# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      class InstanceRepository
        DICTIONARY = 'constructflow.door_window'
        INSTANCE_KEY = 'instance_definition'

        def read(entity)
          payload = Core::AttributeStore.new(entity).read_json(
            INSTANCE_KEY,
            nil,
            dictionary: DICTIONARY
          )
          payload ? InstanceDefinition.from_h(payload) : nil
        end

        def write(entity, definition)
          raise ArgumentError, 'InstanceDefinition required' unless definition.is_a?(InstanceDefinition)

          Core::AttributeStore.new(entity).write_json(
            INSTANCE_KEY,
            definition.to_h,
            dictionary: DICTIONARY
          )
          definition
        end
      end
    end
  end
end
