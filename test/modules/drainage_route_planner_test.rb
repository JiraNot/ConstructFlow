# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/validators/drainage_validator')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/route_planner')

class DrainageRoutePlannerTest < Minitest::Test
  def setup
    @planner = JiraNot::ConstructFlow::Drainage::RoutePlanner.new
  end

  def connector(position, invert = nil)
    {
      'position_mm' => position,
      'properties' => { 'invert_mm' => invert }
    }
  end

  def test_manual_mode_preserves_explicit_via_nodes
    plan = @planner.plan(
      start_connector: connector([0, 0, 1000], 1000),
      end_connector: connector([4000, 3000, 900], 900),
      mode: 'manual',
      via_nodes_mm: [[1000, 500, 975], [2500, 1500, 940]]
    )

    assert_equal 'manual', plan.mode
    assert_equal 4, plan.route_nodes_mm.length
    assert_equal [1000.0, 500.0, 975.0], plan.route_nodes_mm[1]
    assert_in_delta 1.666, plan.slope_percent, 0.01
  end

  def test_semi_auto_orthogonalizes_each_anchor_segment
    plan = @planner.plan(
      start_connector: connector([0, 0, 1000], 1000),
      end_connector: connector([4000, 3000, nil], nil),
      mode: 'semi_auto',
      via_nodes_mm: [[2000, 1000, 0]],
      orthogonal_preference: 'x_first'
    )

    assert_equal 'semi_auto', plan.mode
    assert plan.route_nodes_mm.each_cons(2).all? { |a, b| (a[0] - b[0]).abs <= 0.001 || (a[1] - b[1]).abs <= 0.001 }
    assert_equal 1000.0, plan.start_invert_mm
    refute_nil plan.end_invert_mm
    assert_in_delta 1.0, plan.slope_percent, 0.001
    refute plan.metadata['requires_site_verification']
  end

  def test_auto_mode_derives_minimum_slope_when_only_start_invert_is_known
    plan = @planner.plan(
      start_connector: connector([0, 0, 1200], 1200),
      end_connector: connector([3000, 4000, 0], nil),
      mode: 'auto',
      minimum_slope_percent: 2.0
    )

    assert_equal [[0.0, 0.0, 1200.0], [3000.0, 0.0, 1140.0], [3000.0, 4000.0, 1060.0]], plan.route_nodes_mm
    assert_in_delta 2.0, plan.slope_percent, 0.001
    assert_empty plan.warnings
  end

  def test_known_reverse_slope_is_reported_not_silently_fixed
    plan = @planner.plan(
      start_connector: connector([0, 0, 900], 900),
      end_connector: connector([2000, 0, 950], 950),
      mode: 'auto'
    )

    assert_operator plan.slope_percent, :<, 0
    assert plan.warnings.any? { |message| message.include?('reverse gravity slope') }
  end

  def test_unknown_inverts_remain_verify_on_site
    plan = @planner.plan(
      start_connector: connector([0, 0, 0], nil),
      end_connector: connector([1000, 1000, 0], nil),
      mode: 'semi_auto'
    )

    assert_nil plan.slope_percent
    assert plan.metadata['requires_site_verification']
    assert plan.warnings.any? { |message| message.include?('verify on site') }
  end
end
