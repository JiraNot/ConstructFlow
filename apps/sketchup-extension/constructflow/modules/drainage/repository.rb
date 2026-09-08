# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class Repository
        DICTIONARY = 'constructflow.drainage'
        MANHOLE_KEY = 'manhole_definition'
        PIPE_ROUTE_KEY = 'pipe_route_definition'

        def read_manhole(entity)
          payload = Core::AttributeStore.new(entity).read_json(
            MANHOLE_KEY, nil, dictionary: DICTIONARY
          )
          payload ? ManholeDefinition.from_h(payload) : nil
        end

        def write_manhole(entity, definition)
          raise ArgumentError, 'ManholeDefinition required' unless definition.is_a?(ManholeDefinition)

          Core::AttributeStore.new(entity).write_json(
            MANHOLE_KEY, definition.to_h, dictionary: DICTIONARY
          )
          definition
        end

        def read_pipe_route(entity)
          payload = Core::AttributeStore.new(entity).read_json(
            PIPE_ROUTE_KEY, nil, dictionary: DICTIONARY
          )
          payload ? PipeRouteDefinition.from_h(payload) : nil
        end

        def write_pipe_route(entity, definition)
          raise ArgumentError, 'PipeRouteDefinition required' unless definition.is_a?(PipeRouteDefinition)

          Core::AttributeStore.new(entity).write_json(
            PIPE_ROUTE_KEY, definition.to_h, dictionary: DICTIONARY
          )
          definition
        end
      end
    end
  end
end
