# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class AutoRouteSolver
        EPSILON = 1.0e-6

        Candidate = Struct.new(
          :id, :route_nodes_mm, :horizontal_length_mm, :bends_count,
          :clear, :clashes, :slope_percent, :feasible_slope, :score,
          keyword_init: true
        ) do
          def to_h
            {
              'id' => id,
              'route_nodes_mm' => route_nodes_mm,
              'horizontal_length_mm' => horizontal_length_mm,
              'bends_count' => bends_count,
              'clear' => clear,
              'clashes' => clashes,
              'slope_percent' => slope_percent,
              'feasible_slope' => feasible_slope,
              'score' => score
            }
          end
        end

        def initialize(clearance_mm: 300.0, min_slope_percent: 1.0)
          @clearance_mm = Float(clearance_mm)
          @min_slope_percent = Float(min_slope_percent)
        end

        def solve(start_point:, end_point:, start_invert_mm: nil, end_invert_mm: nil,
                  obstacles: [])
          p_start = normalize_point(start_point)
          p_end = normalize_point(end_point)
          obs_boxes = Array(obstacles).map { |b| normalize_box(b) }

          raw_candidates = generate_candidates(p_start, p_end, obs_boxes)
          evaluated = raw_candidates.map do |id, nodes|
            evaluate_candidate(id, nodes, p_start, p_end, start_invert_mm, end_invert_mm, obs_boxes)
          end

          sorted = evaluated.sort_by(&:score)
          recommended = sorted.find { |c| c.clear && c.feasible_slope } || sorted.find(&:clear)

          {
            'status' => recommended ? 'route_found' : 'all_candidates_obstructed',
            'recommended' => recommended&.to_h,
            'candidates' => sorted.map(&:to_h)
          }
        end

        private

        def generate_candidates(start_pt, end_pt, obstacles)
          candidates = {}

          # 1. Standard Orthogonal
          # X-first: start -> [end_x, start_y] -> end
          mid_x = [end_pt[0], start_pt[1], (start_pt[2] + end_pt[2]) / 2.0]
          candidates['x_first'] = [start_pt, mid_x, end_pt]

          # Y-first: start -> [start_x, end_y] -> end
          mid_y = [start_pt[0], end_pt[1], (start_pt[2] + end_pt[2]) / 2.0]
          candidates['y_first'] = [start_pt, mid_y, end_pt]

          # Direct line
          candidates['direct'] = [start_pt, end_pt]

          # 2. Obstacle Detours
          obstacles.each_with_index do |box, idx|
            xmin = box[:min][0] - @clearance_mm
            xmax = box[:max][0] + @clearance_mm
            ymin = box[:min][1] - @clearance_mm
            ymax = box[:max][1] + @clearance_mm
            z = (start_pt[2] + end_pt[2]) / 2.0

            # Detour below
            candidates["detour_obs#{idx + 1}_below"] = [
              start_pt,
              [start_pt[0], ymin, z],
              [end_pt[0], ymin, z],
              end_pt
            ]

            # Detour above
            candidates["detour_obs#{idx + 1}_above"] = [
              start_pt,
              [start_pt[0], ymax, z],
              [end_pt[0], ymax, z],
              end_pt
            ]

            # Detour left
            candidates["detour_obs#{idx + 1}_left"] = [
              start_pt,
              [xmin, start_pt[1], z],
              [xmin, end_pt[1], z],
              end_pt
            ]

            # Detour right
            candidates["detour_obs#{idx + 1}_right"] = [
              start_pt,
              [xmax, start_pt[1], z],
              [xmax, end_pt[1], z],
              end_pt
            ]
          end

          # Deduplicate consecutive identical points in each candidate
          candidates.transform_values { |nodes| clean_nodes(nodes) }
        end

        def evaluate_candidate(id, nodes, start_pt, end_pt, start_inv, end_inv, obstacles)
          h_len = nodes.each_cons(2).sum do |a, b|
            Math.sqrt(((b[0] - a[0])**2) + ((b[1] - a[1])**2))
          end

          bends = count_bends(nodes)

          clashes = []
          nodes.each_cons(2).with_index do |(a, b), seg_idx|
            seg_box = segment_box(a, b)
            obstacles.each_with_index do |box, obs_idx|
              if boxes_intersect?(seg_box, box)
                clashes << { 'segment' => seg_idx, 'obstacle_index' => obs_idx }
              end
            end
          end

          clear = clashes.empty?
          slope_pct = nil
          feasible_slope = true

          if start_inv && end_inv && h_len > EPSILON
            drop = start_inv - end_inv
            slope_pct = (drop / h_len) * 100.0
            feasible_slope = slope_pct >= @min_slope_percent
          end

          # Score formula: clearance is paramount, then slope feasibility, then fewer bends, then shorter length
          score = 0.0
          score += 1_000_000.0 unless clear
          score += 100_000.0 unless feasible_slope
          score += bends * 500.0
          score += h_len * 0.1

          Candidate.new(
            id: id,
            route_nodes_mm: nodes,
            horizontal_length_mm: h_len,
            bends_count: bends,
            clear: clear,
            clashes: clashes,
            slope_percent: slope_pct,
            feasible_slope: feasible_slope,
            score: score
          )
        end

        def count_bends(nodes)
          return 0 if nodes.length < 3

          bends = 0
          nodes.each_cons(3) do |a, b, c|
            v1 = [b[0] - a[0], b[1] - a[1]]
            v2 = [c[0] - b[0], c[1] - b[1]]
            len1 = Math.sqrt((v1[0]**2) + (v1[1]**2))
            len2 = Math.sqrt((v2[0]**2) + (v2[1]**2))
            next if len1 <= EPSILON || len2 <= EPSILON

            dot = (v1[0] * v2[0]) + (v1[1] * v2[1])
            cos_theta = (dot / (len1 * len2)).clamp(-1.0, 1.0)
            bends += 1 if (cos_theta - 1.0).abs > 0.01
          end
          bends
        end

        def clean_nodes(nodes)
          result = []
          nodes.each do |pt|
            if result.empty? || (pt[0] - result.last[0]).abs > EPSILON ||
               (pt[1] - result.last[1]).abs > EPSILON ||
               (pt[2] - result.last[2]).abs > EPSILON
              result << pt
            end
          end
          result
        end

        def segment_box(a, b)
          {
            min: [[a[0], b[0]].min, [a[1], b[1]].min, [a[2], b[2]].min],
            max: [[a[0], b[0]].max, [a[1], b[1]].max, [a[2], b[2]].max]
          }
        end

        def boxes_intersect?(b1, b2)
          (0..2).all? do |i|
            b1[:min][i] <= b2[:max][i] && b1[:max][i] >= b2[:min][i]
          end
        end

        def normalize_box(box)
          min_pt = box['min'] || box[:min]
          max_pt = box['max'] || box[:max]
          {
            min: [Float(min_pt[0]), Float(min_pt[1]), Float(min_pt[2] || 0.0)],
            max: [Float(max_pt[0]), Float(max_pt[1]), Float(max_pt[2] || 0.0)]
          }
        end

        def normalize_point(p)
          arr = Array(p)
          [Float(arr[0] || 0.0), Float(arr[1] || 0.0), Float(arr[2] || 0.0)]
        end
      end
    end
  end
end
