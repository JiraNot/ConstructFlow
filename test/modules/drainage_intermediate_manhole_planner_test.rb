# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/pipe_route_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/intermediate_manhole_planner')

class DrainageIntermediateManholePlannerTest < Minitest::Test
  def definition(start_invert: 1000, end_invert: 900)
    JiraNot::ConstructFlow::Drainage::PipeRouteDefinition.new(
      system: 'waste', diameter_mm: 100,
      route_nodes_mm: [[0, 0, 1000], [2000, 0, 950], [2000, 3000, 900]],
      start_connector_id: 'start', end_connector_id: 'finish',
      start_invert_mm: start_invert, end_invert_mm: end_invert,
      route_strategy: 'manual'
    )
  end

  def test_split_preserves_continuity_and_interpolates_invert_by_horizontal_distance
    split = JiraNot::ConstructFlow::Drainage::IntermediateManholePlanner.new.split(
      definition: definition, segment_index: 1, segment_ratio: 0.5
    )
    assert_equal [2000.0, 1500.0, 930.0], split.location_mm
    assert_in_delta 930.0, split.invert_mm, 0.001
    assert_equal split.location_mm, split.upstream_nodes_mm.last
    assert_equal split.location_mm, split.downstream_nodes_mm.first
    assert_equal [0.0, 0.0, 1000.0], split.upstream_nodes_mm.first
    assert_equal [2000.0, 3000.0, 900.0], split.downstream_nodes_mm.last
  end

  def test_unknown_endpoint_invert_remains_unknown
    split = JiraNot::ConstructFlow::Drainage::IntermediateManholePlanner.new.split(
      definition: definition(start_invert: nil, end_invert: nil), segment_index: 0, segment_ratio: 0.25
    )
    assert_nil split.invert_mm
    assert_in_delta 500.0, split.location_mm[0], 0.001
  end

  def test_rejects_endpoint_ratio
    planner = JiraNot::ConstructFlow::Drainage::IntermediateManholePlanner.new
    assert_raises(ArgumentError) { planner.split(definition: definition, segment_index: 0, segment_ratio: 0.0) }
    assert_raises(ArgumentError) { planner.split(definition: definition, segment_index: 0, segment_ratio: 1.0) }
  end
end
