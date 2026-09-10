# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class IntermediateManholePlanner
        Split = Struct.new(
          :location_mm, :invert_mm, :upstream_nodes_mm, :downstream_nodes_mm,
          :segment_index, :segment_ratio,
          keyword_init: true
        ) do
          def to_h
            {
              'location_mm' => location_mm,
              'invert_mm' => invert_mm,
              'upstream_nodes_mm' => upstream_nodes_mm,
              'downstream_nodes_mm' => downstream_nodes_mm,
              'segment_index' => segment_index,
              'segment_ratio' => segment_ratio
            }.freeze
          end
        end

        def split(definition:, segment_index:, segment_ratio: 0.5)
          raise ArgumentError, 'PipeRouteDefinition required' unless definition.is_a?(PipeRouteDefinition)
          index = Integer(segment_index)
          nodes = definition.route_nodes_mm
          raise ArgumentError, 'segment_index out of range' if index.negative? || index >= nodes.length - 1
          ratio = Float(segment_ratio)
          raise ArgumentError, 'segment_ratio must be greater than 0 and less than 1' unless ratio.positive? && ratio < 1.0

          a = nodes[index]
          b = nodes[index + 1]
          location = [
            a[0] + ((b[0] - a[0]) * ratio),
            a[1] + ((b[1] - a[1]) * ratio),
            a[2] + ((b[2] - a[2]) * ratio)
          ]
          invert = split_invert(definition, index, ratio)
          location[2] = invert unless invert.nil?

          upstream = nodes[0..index].map(&:dup) + [location.dup]
          downstream = [location.dup] + nodes[(index + 1)..].map(&:dup)

          Split.new(
            location_mm: location.freeze,
            invert_mm: invert,
            upstream_nodes_mm: deep_freeze(upstream),
            downstream_nodes_mm: deep_freeze(downstream),
            segment_index: index,
            segment_ratio: ratio
          ).freeze
        end

        private

        def split_invert(definition, segment_index, ratio)
          return nil unless definition.start_invert_mm && definition.end_invert_mm
          total = definition.horizontal_length_mm
          return definition.start_invert_mm if total <= 0.001

          travelled = 0.0
          definition.route_nodes_mm.each_cons(2).with_index do |(a, b), index|
            segment = horizontal_distance(a, b)
            if index == segment_index
              travelled += segment * ratio
              break
            end
            travelled += segment
          end
          definition.start_invert_mm + ((definition.end_invert_mm - definition.start_invert_mm) * (travelled / total))
        end

        def horizontal_distance(a, b)
          dx = b[0] - a[0]
          dy = b[1] - a[1]
          Math.sqrt((dx * dx) + (dy * dy))
        end

        def deep_freeze(nodes)
          nodes.each(&:freeze)
          nodes.freeze
        end
      end
    end
  end
end
