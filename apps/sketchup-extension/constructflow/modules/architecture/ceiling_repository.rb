# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class CeilingRepository
        DICTIONARY = 'constructflow.architecture'
        KEY = 'ceiling_definition'

        def read(entity)
          payload = Core::AttributeStore.new(entity).read_json(KEY, nil, dictionary: DICTIONARY)
          payload ? CeilingDefinition.from_h(payload) : nil
        end

        def write(entity, definition)
          raise ArgumentError, 'CeilingDefinition required' unless definition.is_a?(CeilingDefinition)

          Core::AttributeStore.new(entity).write_json(KEY, definition.to_h, dictionary: DICTIONARY)
          definition
        end
      end
    end
  end
end
