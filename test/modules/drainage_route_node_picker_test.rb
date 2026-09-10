# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/route_node_picker')

class DrainageRouteNodePickerTest < Minitest::Test
  def setup
    @picker = JiraNot::ConstructFlow::Drainage::RouteNodePicker.new
    @nodes = [[0, 0, 0], [1000, 0, 0], [2000, 500, 0], [3000, 500, 0]]
    @projector = ->(point) { [point[0] / 10.0, point[1] / 10.0] }
  end

  def test_picks_nearest_internal_node_within_threshold
    result = @picker.nearest_internal_node(route_nodes_mm: @nodes, cursor_xy: [101, 2], projector: @projector, threshold_px: 10)
    assert_equal 1, result['node_index']
  end

  def test_never_picks_connector_owned_endpoints
    result = @picker.nearest_internal_node(route_nodes_mm: @nodes, cursor_xy: [0, 0], projector: @projector, threshold_px: 5)
    assert_nil result
  end

  def test_returns_nil_outside_pick_radius
    result = @picker.nearest_internal_node(route_nodes_mm: @nodes, cursor_xy: [500, 500], projector: @projector, threshold_px: 10)
    assert_nil result
  end
end
