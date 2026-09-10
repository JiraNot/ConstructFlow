# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class RouteEditService
        def move(definition:, node_index:, position_mm:, regrade: false)
          nodes = editable_nodes(definition)
          index = Integer(node_index)
          validate_internal_index!(nodes, index)
          nodes[index] = normalize_point(position_mm)
          nodes = regrade_nodes(nodes, definition.start_invert_mm, definition.end_invert_mm) if regrade
          definition.with(route_nodes_mm: nodes, route_strategy: 'manual')
        end

        def insert(definition:, after_index:, position_mm:, regrade: false)
          nodes = editable_nodes(definition)
          index = Integer(after_index)
          raise ArgumentError, 'insert index must identify an existing segment' if index.negative? || index >= nodes.length - 1
          nodes.insert(index + 1, normalize_point(position_mm))
          nodes = regrade_nodes(nodes, definition.start_invert_mm, definition.end_invert_mm) if regrade
          definition.with(route_nodes_mm: nodes, route_strategy: 'manual')
        end

        def remove(definition:, node_index:, regrade: false)
          nodes = editable_nodes(definition)
          index = Integer(node_index)
          validate_internal_index!(nodes, index)
          raise ArgumentError, 'route must keep at least two nodes' if nodes.length <= 2
          nodes.delete_at(index)
          nodes = regrade_nodes(nodes, definition.start_invert_mm, definition.end_invert_mm) if regrade
          definition.with(route_nodes_mm: nodes, route_strategy: 'manual')
        end

        private

        def editable_nodes(definition)
          raise ArgumentError, 'PipeRouteDefinition required' unless definition.is_a?(PipeRouteDefinition)
          definition.route_nodes_mm.map(&:dup)
        end

        def validate_internal_index!(nodes, index)
          raise ArgumentError, 'route endpoints are connector-owned and cannot be moved/removed as control nodes' if index <= 0 || index >= nodes.length - 1
        end

        def normalize_point(value)
          values = Array(value)
          raise ArgumentError, 'route node requires x, y, z' unless values.length >= 3
          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

        def regrade_nodes(nodes, start_invert, end_invert)
          return nodes if start_invert.nil? || end_invert.nil?
          total = horizontal_length(nodes)
          return nodes if total <= 0.001
          travelled = 0.0
          nodes.each_with_index.map do |point, index|
            if index.zero?
              [point[0], point[1], Float(start_invert)]
            elsif index == nodes.length - 1
              [point[0], point[1], Float(end_invert)]
            else
              travelled += horizontal_distance(nodes[index - 1], point)
              ratio = travelled / total
              [point[0], point[1], Float(start_invert) + ((Float(end_invert) - Float(start_invert)) * ratio)]
            end
          end
        end

        def horizontal_length(nodes)
          nodes.each_cons(2).sum { |a, b| horizontal_distance(a, b) }
        end

        def horizontal_distance(a, b)
          dx = b[0] - a[0]
          dy = b[1] - a[1]
          Math.sqrt((dx * dx) + (dy * dy))
        end
      end
    end
  end
end
