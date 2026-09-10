# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class RouteNodePicker
        def nearest_internal_node(route_nodes_mm:, cursor_xy:, projector:, threshold_px: 14.0)
          nodes = Array(route_nodes_mm)
          return nil if nodes.length < 3
          cx, cy = Array(cursor_xy).first(2).map { |value| Float(value) }
          threshold = Float(threshold_px)
          best = nil
          nodes.each_with_index do |point, index|
            next if index.zero? || index == nodes.length - 1
            screen = Array(projector.call(point))
            next if screen.length < 2
            dx = Float(screen[0]) - cx
            dy = Float(screen[1]) - cy
            distance = Math.sqrt((dx * dx) + (dy * dy))
            next if distance > threshold
            candidate = { 'node_index' => index, 'distance_px' => distance, 'point_mm' => point }
            best = candidate if best.nil? || distance < best['distance_px']
          end
          best&.freeze
        end
      end
    end
  end
end
