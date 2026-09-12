# frozen_string_literal: true

require_relative '../test_helper'

module JiraNot
  module ConstructFlow
    module Drainage
      class AutoRouteSolverTest < Minitest::Test
        def test_unobstructed_route_finds_direct_or_orthogonal
          solver = AutoRouteSolver.new(clearance_mm: 200.0, min_slope_percent: 1.0)
          result = solver.solve(
            start_point: [0.0, 0.0, 100.0],
            end_point: [5000.0, 2000.0, 0.0],
            start_invert_mm: 100.0,
            end_invert_mm: 0.0,
            obstacles: []
          )

          assert_equal 'route_found', result['status']
          assert result['recommended']
          assert result['recommended']['clear']
          assert result['recommended']['feasible_slope']
          assert_operator result['recommended']['horizontal_length_mm'], :>, 0
        end

        def test_obstacle_avoidance_generates_clear_detour
          solver = AutoRouteSolver.new(clearance_mm: 100.0, min_slope_percent: 1.0)
          # Obstacle right in the middle between [0, 0] and [4000, 0]
          obstacle = {
            min: [1500.0, -200.0, -100.0],
            max: [2500.0, 200.0, 500.0]
          }

          result = solver.solve(
            start_point: [0.0, 0.0, 200.0],
            end_point: [4000.0, 0.0, 100.0],
            start_invert_mm: 200.0,
            end_invert_mm: 100.0,
            obstacles: [obstacle]
          )

          assert_equal 'route_found', result['status']
          recommended = result['recommended']
          assert recommended['clear'], 'Recommended route must be clear of obstacles'

          # Direct route would clash with obstacle
          direct = result['candidates'].find { |c| c['id'] == 'direct' }
          refute direct['clear'], 'Direct candidate should clash with obstacle'
        end

        def test_slope_feasibility_scoring
          solver = AutoRouteSolver.new(min_slope_percent: 2.0)
          # Invert drop of 10mm over 5000mm length is only 0.2% slope (< 2.0%)
          result = solver.solve(
            start_point: [0.0, 0.0, 10.0],
            end_point: [5000.0, 0.0, 0.0],
            start_invert_mm: 10.0,
            end_invert_mm: 0.0,
            obstacles: []
          )

          # Candidate slope percent is evaluated
          cand = result['candidates'].first
          assert_in_delta 0.2, cand['slope_percent'], 0.05
          refute cand['feasible_slope']
        end

        def test_solve_auto_route_command
          runtime = build_test_runtime
          RoutingRegistration.install(runtime)

          result = runtime.commands.execute('SolveAutoRoute', {
            start_point: [0.0, 0.0, 500.0],
            end_point: [3000.0, 3000.0, 100.0],
            start_invert_mm: 500.0,
            end_invert_mm: 100.0,
            clearance_mm: 250.0
          })

          assert result[:events]
          event = result[:events].find { |e| e[:name] == 'AutoRouteSolved' }
          assert event
          payload = event[:payload]
          assert_equal 'route_found', payload['status']
          assert payload['recommended']
        end
      end
    end
  end
end
