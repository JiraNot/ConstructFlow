# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      class ConduitRouteSolver
        EPSILON = 1.0e-6

        RoutePlan = Struct.new(
          :id, :route_nodes_mm, :length_mm, :bend_angles_deg,
          :cumulative_bend_deg, :pull_boxes_count, :pull_box_positions_mm,
          :compliant_bends, keyword_init: true
        ) do
          def to_h
            {
              'id' => id,
              'route_nodes_mm' => route_nodes_mm,
              'length_mm' => length_mm,
              'bend_angles_deg' => bend_angles_deg,
              'cumulative_bend_deg' => cumulative_bend_deg,
              'pull_boxes_count' => pull_boxes_count,
              'pull_box_positions_mm' => pull_box_positions_mm,
              'compliant_bends' => compliant_bends
            }
          end
        end

        def initialize(max_bend_deg: 360.0, max_pull_distance_mm: 30_000.0)
          @max_bend_deg = Float(max_bend_deg)
          @max_pull_distance_mm = Float(max_pull_distance_mm)
        end

        def solve(start_point:, end_point:, ceiling_z_mm: nil, floor_z_mm: nil, strategy: 'ceiling_first')
          p1 = normalize_point(start_point)
          p2 = normalize_point(end_point)

          nodes = case strategy
                  when 'direct'
                    [p1, p2]
                  when 'floor_first'
                    solve_via_elevation(p1, p2, floor_z_mm || [p1[2], p2[2]].min)
                  else # 'ceiling_first'
                    solve_via_elevation(p1, p2, ceiling_z_mm || [p1[2], p2[2]].max)
                  end

          temp_route = ConduitRouteDefinition.new(
            nominal_size_mm: 20.0,
            route_nodes_mm: nodes
          )

          angles = temp_route.bend_angles_deg
          total_bends = temp_route.cumulative_bend_deg
          pull_box_indices = temp_route.pull_box_recommended_indices
          pull_box_positions = pull_box_indices.map { |i| nodes[i] }

          RoutePlan.new(
            id: strategy,
            route_nodes_mm: nodes,
            length_mm: temp_route.length_mm,
            bend_angles_deg: angles,
            cumulative_bend_deg: total_bends,
            pull_boxes_count: pull_box_positions.length,
            pull_box_positions_mm: pull_box_positions,
            compliant_bends: total_bends <= @max_bend_deg
          )
        end

        private

        def solve_via_elevation(start_pt, end_pt, via_z)
          # 3D Orthogonal routing:
          # 1. Rise/fall from start_pt to via_z
          # 2. Travel along X at via_z
          # 3. Travel along Y at via_z
          # 4. Rise/fall to end_pt
          nodes = [start_pt]

          if (via_z - start_pt[2]).abs > EPSILON
            nodes << [start_pt[0], start_pt[1], via_z]
          end

          if (end_pt[0] - start_pt[0]).abs > EPSILON
            nodes << [end_pt[0], start_pt[1], via_z]
          end

          if (end_pt[1] - start_pt[1]).abs > EPSILON
            nodes << [end_pt[0], end_pt[1], via_z]
          end

          if (via_z - end_pt[2]).abs > EPSILON
            nodes << end_pt
          end

          # Deduplicate adjacent identical points
          clean_nodes(nodes)
        end

        def clean_nodes(points)
          cleaned = []
          points.each do |pt|
            if cleaned.empty? ||
               (pt[0] - cleaned.last[0]).abs > EPSILON ||
               (pt[1] - cleaned.last[1]).abs > EPSILON ||
               (pt[2] - cleaned.last[2]).abs > EPSILON
              cleaned << pt
            end
          end
          cleaned
        end

        def normalize_point(val)
          a = Array(val)
          [Float(a[0] || 0.0), Float(a[1] || 0.0), Float(a[2] || 0.0)]
        end
      end
    end
  end
end
