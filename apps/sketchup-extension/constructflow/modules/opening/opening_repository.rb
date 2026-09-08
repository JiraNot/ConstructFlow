# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Opening
      class OpeningRepository
        DICTIONARY = 'constructflow.opening'
        DEFINITION_KEY = 'opening_definition'
        INFILL_KEY = 'infill_ref'

        def read(entity)
          payload = Core::AttributeStore.new(entity).read_json(
            DEFINITION_KEY,
            nil,
            dictionary: DICTIONARY
          )
          payload ? OpeningDefinition.from_h(payload) : nil
        end

        def write(entity, definition)
          raise ArgumentError, 'OpeningDefinition required' unless definition.is_a?(OpeningDefinition)

          Core::AttributeStore.new(entity).write_json(
            DEFINITION_KEY,
            definition.to_h,
            dictionary: DICTIONARY
          )
          definition
        end

        def infill_ref(entity)
          Core::AttributeStore.new(entity).read_json(
            INFILL_KEY,
            nil,
            dictionary: DICTIONARY
          )
        end

        def write_infill_ref(entity, value)
          store = Core::AttributeStore.new(entity)
          if value.nil?
            store.delete(INFILL_KEY, dictionary: DICTIONARY)
            return nil
          end

          normalized = value.each_with_object({}) { |(key, item), result| result[key.to_s] = item }
          store.write_json(INFILL_KEY, normalized, dictionary: DICTIONARY)
          normalized
        end
      end
    end
  end
end
