# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/pipe_route_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/route_edit_service')

class DrainageRouteEditServiceTest < Minitest::Test
  def setup
    @service = JiraNot::ConstructFlow::Drainage::RouteEditService.new
    @definition = JiraNot::ConstructFlow::Drainage::PipeRouteDefinition.new(
      system: 'waste', diameter_mm: 100,
      route_nodes_mm: [[0, 0, 1000], [1000, 0, 980], [2000, 0, 960]],
      start_connector_id: 'a', end_connector_id: 'b',
      start_invert_mm: 1000, end_invert_mm: 960, route_strategy: 'auto'
    )
  end

  def test_move_internal_node_preserves_identity_inputs_and_becomes_manual
    updated = @service.move(definition: @definition, node_index: 1, position_mm: [1000, 500, 975])
    assert_equal [1000.0, 500.0, 975.0], updated.route_nodes_mm[1]
    assert_equal 'a', updated.start_connector_id
    assert_equal 'b', updated.end_connector_id
    assert_equal 'manual', updated.route_strategy
  end

  def test_endpoint_move_is_rejected
    error = assert_raises(ArgumentError) do
      @service.move(definition: @definition, node_index: 0, position_mm: [10, 0, 1000])
    end
    assert_includes error.message, 'connector-owned'
  end

  def test_insert_and_remove_internal_control_node
    inserted = @service.insert(definition: @definition, after_index: 0, position_mm: [500, 300, 990])
    assert_equal 4, inserted.route_nodes_mm.length
    removed = @service.remove(definition: inserted, node_index: 1)
    assert_equal @definition.route_nodes_mm, removed.route_nodes_mm
  end

  def test_regrade_interpolates_internal_z_between_known_inverts
    updated = @service.move(definition: @definition, node_index: 1, position_mm: [1000, 1000, 1234], regrade: true)
    assert_in_delta 980.0, updated.route_nodes_mm[1][2], 0.001
    assert_equal 1000.0, updated.route_nodes_mm.first[2]
    assert_equal 960.0, updated.route_nodes_mm.last[2]
  end
end
