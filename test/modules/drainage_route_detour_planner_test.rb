# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/validators/drainage_validator')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/route_planner')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/route_detour_planner')

class DetourEvaluator
  def evaluate(nodes)
    crosses_center = nodes.each_cons(2).any? do |a, b|
      min_x, max_x = [a[0], b[0]].minmax
      min_y, max_y = [a[1], b[1]].minmax
      min_x <= 2200 && max_x >= 1800 && min_y <= 200 && max_y >= -200
    end
    {
      'clear' => !crosses_center,
      'clashes' => crosses_center ? [{ 'object_id' => 'footing-1', 'object_type' => 'structure.foundation', 'box_mm' => { 'min' => [1800, -200, 800], 'max' => [2200, 200, 1100] } }] : [],
      'obstacle_count' => 1
    }
  end
end

class DrainageRouteDetourPlannerTest < Minitest::Test
  def connector(position, invert)
    { 'position_mm' => position, 'properties' => { 'invert_mm' => invert } }
  end

  def test_generates_clearance_candidates_and_recommends_shortest_clear_one
    planner = JiraNot::ConstructFlow::Drainage::RouteDetourPlanner.new(runtime: Object.new, evaluator: DetourEvaluator.new)
    result = planner.alternatives(
      start_connector: connector([0, 0, 1000], 1000),
      end_connector: connector([4000, 0, 900], 900),
      clearance_mm: 300
    )

    assert_equal 'detour_available', result['status']
    refute_nil result['recommended_id']
    assert_equal 4, result['candidates'].length
    recommended = result['candidates'].find { |item| item['id'] == result['recommended_id'] }
    assert recommended['evaluation']['clear']
    assert_operator recommended['plan']['route_nodes_mm'].length, :>=, 4
  end

  def test_returns_baseline_when_no_clash_exists
    clear_evaluator = Class.new do
      def evaluate(_nodes)
        { 'clear' => true, 'clashes' => [], 'obstacle_count' => 0 }
      end
    end.new
    planner = JiraNot::ConstructFlow::Drainage::RouteDetourPlanner.new(runtime: Object.new, evaluator: clear_evaluator)
    result = planner.alternatives(
      start_connector: connector([0, 0, 1000], 1000),
      end_connector: connector([4000, 1000, 900], 900)
    )
    assert_equal 'baseline_clear', result['status']
    assert_equal 'baseline', result['recommended_id']
    assert_empty result['candidates']
  end
end
