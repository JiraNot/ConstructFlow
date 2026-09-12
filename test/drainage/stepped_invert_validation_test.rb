# frozen_string_literal: true

require_relative '../test_helper'

module JiraNot
  module ConstructFlow
    module Drainage
      class SteppedInvertValidationTest < Minitest::Test
        def setup
          @validator = Validators::DrainageValidator.new
        end

        def test_compliant_multi_segment_route
          # Continuous downward slope
          route = PipeRouteDefinition.new(
            system: 'waste',
            start_connector_id: 'c1',
            end_connector_id: 'c2',
            route_nodes_mm: [
              [0.0, 0.0, 500.0],
              [2000.0, 0.0, 480.0],
              [4000.0, 0.0, 460.0]
            ],
            start_invert_mm: 500.0,
            end_invert_mm: 460.0
          )

          assert_equal 2, route.segment_slopes.length
          refute route.has_reverse_slope?
          assert_empty route.backdrop_candidates

          issues = @validator.validate_route(route)
          errors = issues.select { |i| i[:severity] == 'error' }
          assert_empty errors
        end

        def test_detects_segment_reverse_slope_water_trap
          # Segment 0 drops 500 -> 400, but segment 1 rises 400 -> 450 (reverse slope / water trap!)
          # Even if overall 500 -> 450 is downward
          route = PipeRouteDefinition.new(
            system: 'waste',
            start_connector_id: 'c1',
            end_connector_id: 'c2',
            route_nodes_mm: [
              [0.0, 0.0, 500.0],
              [2000.0, 0.0, 400.0],
              [4000.0, 0.0, 450.0]
            ],
            start_invert_mm: 500.0,
            end_invert_mm: 450.0
          )

          assert route.has_reverse_slope?
          slopes = route.segment_slopes
          assert slopes[1][:reverse_slope]

          issues = @validator.validate_route(route)
          rev_issue = issues.find { |i| i[:rule_id] == 'drainage.route.segment_reverse_slope' }
          assert rev_issue, 'Should flag segment reverse slope water trap'
          assert_equal 'error', rev_issue[:severity]
          assert_includes rev_issue[:message], 'water trap risk'
        end

        def test_detects_backdrop_drop_requirement
          # Segment with steep drop: 600mm drop (> 500mm threshold) over 1000mm length (60% slope > 10%)
          route = PipeRouteDefinition.new(
            system: 'soil',
            start_connector_id: 'c1',
            end_connector_id: 'c2',
            route_nodes_mm: [
              [0.0, 0.0, 1000.0],
              [1000.0, 0.0, 400.0]
            ],
            start_invert_mm: 1000.0,
            end_invert_mm: 400.0
          )

          candidates = route.backdrop_candidates
          refute_empty candidates
          assert candidates.first[:excessive_fall]
          assert candidates.first[:steep_slope]

          issues = @validator.validate_route(route)
          backdrop_issue = issues.find { |i| i[:rule_id] == 'drainage.route.backdrop_required' }
          assert backdrop_issue, 'Should flag backdrop drop requirement'
          assert_equal 'warning', backdrop_issue[:severity]
          assert_includes backdrop_issue[:message], 'backdrop drop recommended'
        end
      end
    end
  end
end
