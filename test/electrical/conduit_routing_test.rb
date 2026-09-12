# frozen_string_literal: true

require_relative '../test_helper'

module JiraNot
  module ConstructFlow
    module Electrical
      class ConduitRoutingTest < Minitest::Test
        def setup
          @runtime = build_test_runtime
          Registration.install(@runtime)
        end

        def test_conduit_route_definition_bends_and_pull_box
          # A route with four 90-degree bends:
          # (0,0,0) -> (1000,0,0) -> (1000,1000,0) -> (0,1000,0) -> (0,0,0) -> (0,0,1000)
          # Four 90-deg bends = 360 deg cumulative
          route = ConduitRouteDefinition.new(
            nominal_size_mm: 20.0,
            route_nodes_mm: [
              [0.0, 0.0, 0.0],
              [1000.0, 0.0, 0.0],
              [1000.0, 1000.0, 0.0],
              [0.0, 1000.0, 0.0],
              [0.0, 0.0, 0.0],
              [0.0, 0.0, 1000.0]
            ]
          )

          assert route.valid?
          assert_equal 5000.0, route.length_mm
          assert_equal 120.0, route.min_bend_radius_mm # 6 * 20mm = 120mm

          angles = route.bend_angles_deg
          assert_equal 4, angles.length
          angles.each { |a| assert_in_delta 90.0, a, 0.5 }

          assert_in_delta 360.0, route.cumulative_bend_deg, 1.0
          refute route.max_bends_exceeded? # Exactly 360 deg is permitted

          # Add one more 90 deg bend -> 450 deg > 360 deg
          route5 = route.with(route_nodes_mm: route.route_nodes_mm + [[1000.0, 0.0, 1000.0]])
          assert route5.max_bends_exceeded?
          assert route5.pull_box_required?
          assert_includes route5.pull_box_recommended_indices, 4
        end

        def test_conduit_route_solver_ceiling_first
          solver = ConduitRouteSolver.new
          # Wall switch at [500, 0, 1200] to ceiling light at [2500, 3000, 2800]
          plan = solver.solve(
            start_point: [500.0, 0.0, 1200.0],
            end_point: [2500.0, 3000.0, 2800.0],
            ceiling_z_mm: 2800.0,
            strategy: 'ceiling_first'
          )

          assert plan.compliant_bends
          # Rises from 1200 to 2800 (1600mm), travels X (2000mm), travels Y (3000mm) = 6600mm
          assert_in_delta 6600.0, plan.length_mm, 1.0
          assert_equal 0, plan.pull_boxes_count
        end

        def test_create_conduit_route_command
          res = @runtime.commands.execute('CreateConduitRoute', {
            nominal_size_mm: 25.0,
            conduit_type: 'emt',
            system: 'power',
            start_point: [0.0, 0.0, 1000.0],
            end_point: [4000.0, 3000.0, 1000.0],
            ceiling_z_mm: 2600.0,
            strategy: 'ceiling_first'
          })

          assert_equal 'success', res[:status], res[:errors]
          conduit_id = res[:created_object_ids].first
          assert conduit_id

          obj = @runtime.smart_objects.fetch_by_id(conduit_id)
          assert_equal 'electrical.conduit_route', obj.type

          repo = Repository.new
          c_def = repo.read_conduit(obj.entity)
          assert_equal 25.0, c_def.nominal_size_mm
          assert_equal 'emt', c_def.conduit_type
          assert_operator c_def.length_mm, :>, 0
        end
      end
    end
  end
end
