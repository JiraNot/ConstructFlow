# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      class Repository
        DICTIONARY = 'constructflow.structure'
        COLUMN_KEY = 'column_definition'
        FOUNDATION_KEY = 'foundation_definition'
        REBAR_SET_KEY = 'rebar_set_definition'

        def read_column(entity)
          payload = read(entity, COLUMN_KEY)
          payload ? ColumnDefinition.from_h(payload) : nil
        end

        def write_column(entity, definition)
          raise ArgumentError, 'ColumnDefinition required' unless definition.is_a?(ColumnDefinition)
          write(entity, COLUMN_KEY, definition.to_h)
          definition
        end

        def read_foundation(entity)
          payload = read(entity, FOUNDATION_KEY)
          payload ? FoundationDefinition.from_h(payload) : nil
        end

        def write_foundation(entity, definition)
          raise ArgumentError, 'FoundationDefinition required' unless definition.is_a?(FoundationDefinition)
          write(entity, FOUNDATION_KEY, definition.to_h)
          definition
        end

        def read_rebar_set(entity)
          payload = read(entity, REBAR_SET_KEY)
          payload ? RebarSetDefinition.from_h(payload) : nil
        end

        def write_rebar_set(entity, definition)
          raise ArgumentError, 'RebarSetDefinition required' unless definition.is_a?(RebarSetDefinition)
          write(entity, REBAR_SET_KEY, definition.to_h)
          definition
        end

        private

        def read(entity, key)
          Core::AttributeStore.new(entity).read_json(key, nil, dictionary: DICTIONARY)
        end

        def write(entity, key, payload)
          Core::AttributeStore.new(entity).write_json(key, payload, dictionary: DICTIONARY)
        end
      end
    end
  end
end
