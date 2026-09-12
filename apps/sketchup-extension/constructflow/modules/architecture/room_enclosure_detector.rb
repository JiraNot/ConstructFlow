# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class RoomEnclosureDetector
        DEFAULT_TOLERANCE_MM = 1.0
        MAX_CYCLES = 1_000

        def detect(walls:, tolerance_mm: DEFAULT_TOLERANCE_MM)
          segments = Array(walls).select { |wall| room_bounding?(wall) }.flat_map do |wall|
            path = wall.respond_to?(:centerline_path_mm) ? wall.centerline_path_mm : wall.path_mm
            Array(path).each_cons(2).map { |a, b| [a, b] }
          end.reject { |a, b| distance_sq(a, b) <= 0.001 }
          nodes, edges = build_graph(segments, Float(tolerance_mm))
          cycles = enumerate_cycles(nodes, edges)
          cycles.map { |cycle| cycle.map { |node_id| nodes.fetch(node_id).dup.freeze }.freeze }
                 .sort_by { |boundary| [-area_mm2(boundary), boundary.map { |point| point.first(2) }] }
                 .freeze
        end

        private

        def room_bounding?(wall)
          !wall.respond_to?(:room_bounding) || wall.room_bounding
        end

        def build_graph(segments, tolerance)
          nodes = []
          edges = []
          split_points = segments.map { |first, second| [first, second] }
          segments.each_with_index do |first, first_index|
            segments.each_with_index do |second, second_index|
              next if second_index <= first_index

              point = intersection_point(first, second, tolerance)
              next unless point

              split_points[first_index] << point
              split_points[second_index] << point
            end
          end
          node_for = lambda do |point|
            index = nodes.index { |existing| distance_sq(existing, point) <= tolerance * tolerance }
            return index if index

            nodes << point.map { |value| Float(value) }.freeze
            nodes.length - 1
          end
          split_points.each do |points|
            first, second = points.first(2)
            dx = second[0] - first[0]
            dy = second[1] - first[1]
            ordered = points.uniq.sort_by do |point|
              (((point[0] - first[0]) * dx) + ((point[1] - first[1]) * dy)) / ((dx * dx) + (dy * dy))
            end
            ordered.each_cons(2) do |a_point, b_point|
              a = node_for.call(a_point)
              b = node_for.call(b_point)
              edges << [a, b] unless a == b
            end
          end
          [nodes, edges.uniq]
        end

        def intersection_point(first, second, tolerance)
          a, b = first
          c, d = second
          denominator = ((b[0] - a[0]) * (d[1] - c[1])) - ((b[1] - a[1]) * (d[0] - c[0]))
          return nil if denominator.abs <= 0.001

          ua = (((d[0] - c[0]) * (a[1] - c[1])) - ((d[1] - c[1]) * (a[0] - c[0]))) / denominator
          ub = (((b[0] - a[0]) * (a[1] - c[1])) - ((b[1] - a[1]) * (a[0] - c[0]))) / denominator
          return nil unless ua.between?(-tolerance / [distance(a, b), 1.0].max, 1.0 + tolerance / [distance(a, b), 1.0].max) &&
                          ub.between?(-tolerance / [distance(c, d), 1.0].max, 1.0 + tolerance / [distance(c, d), 1.0].max)

          [a[0] + (ua * (b[0] - a[0])), a[1] + (ua * (b[1] - a[1])), (a[2] + b[2] + c[2] + d[2]) / 4.0]
        end

        def enumerate_cycles(nodes, edges)
          adjacency = Hash.new { |hash, key| hash[key] = [] }
          edges.each do |a, b|
            adjacency[a] << b
            adjacency[b] << a
          end
          found = {}
          edges.each do |start, neighbor|
            dfs_cycle(start, neighbor, [start, neighbor], adjacency, found, nodes)
            break if found.length >= MAX_CYCLES
          end
          found.values
        end

        def dfs_cycle(start, current, path, adjacency, found, nodes)
          return if path.length > nodes.length

          adjacency[current].sort_by { |node| angle(nodes[current], nodes[node]) }.each do |next_node|
            if next_node == start && path.length >= 3
              boundary = path.map { |node_id| nodes[node_id] }
              found[canonical_key(path)] ||= path.dup if area_mm2(boundary) > 1.0
              next
            end
            next if path.include?(next_node)

            dfs_cycle(start, next_node, path + [next_node], adjacency, found, nodes)
            return if found.length >= MAX_CYCLES
          end
        end

        def canonical_key(path)
          rotations = [path, path.reverse].flat_map do |values|
            values.each_index.map { |index| values.rotate(index) }
          end
          rotations.min.join(',')
        end

        def area_mm2(boundary)
          boundary.each_with_index.sum do |point, index|
            next_point = boundary[(index + 1) % boundary.length]
            (point[0] * next_point[1]) - (next_point[0] * point[1])
          end.abs / 2.0
        end

        def angle(first, second)
          Math.atan2(second[1] - first[1], second[0] - first[0])
        end

        def distance_sq(first, second)
          ((first[0] - second[0])**2) + ((first[1] - second[1])**2) + ((first[2] - second[2])**2)
        end

        def distance(first, second)
          Math.sqrt(distance_sq(first, second))
        end
      end
    end
  end
end
