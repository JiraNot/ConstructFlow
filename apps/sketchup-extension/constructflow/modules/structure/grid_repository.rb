# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      class GridRepository
        DICTIONARY = 'constructflow.structure'
        KEY = 'grid_definition'

        def read(entity)
          payload = Core::AttributeStore.new(entity).read_json(KEY, nil, dictionary: DICTIONARY)
          payload ? GridDefinition.from_h(payload) : nil
        end

        def write(entity, definition)
          raise ArgumentError, 'GridDefinition required' unless definition.is_a?(GridDefinition)

          Core::AttributeStore.new(entity).write_json(KEY, definition.to_h, dictionary: DICTIONARY)
          definition
        end
      end
    end
  end
end
