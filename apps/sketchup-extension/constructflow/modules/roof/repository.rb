# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      class Repository
        DICTIONARY = 'constructflow.roof'
        ROOF_KEY = 'roof_definition'
        GUTTER_KEY = 'gutter_definition'

        def read_roof(entity)
          payload = Core::AttributeStore.new(entity).read_json(ROOF_KEY, nil, dictionary: DICTIONARY)
          payload ? RoofDefinition.from_h(payload) : nil
        end

        def write_roof(entity, definition)
          raise ArgumentError, 'RoofDefinition required' unless definition.is_a?(RoofDefinition)

          Core::AttributeStore.new(entity).write_json(ROOF_KEY, definition.to_h, dictionary: DICTIONARY)
          definition
        end

        def read_gutter(entity)
          payload = Core::AttributeStore.new(entity).read_json(GUTTER_KEY, nil, dictionary: DICTIONARY)
          payload ? GutterDefinition.from_h(payload) : nil
        end

        def write_gutter(entity, definition)
          raise ArgumentError, 'GutterDefinition required' unless definition.is_a?(GutterDefinition)

          Core::AttributeStore.new(entity).write_json(GUTTER_KEY, definition.to_h, dictionary: DICTIONARY)
          definition
        end
      end
    end
  end
end
