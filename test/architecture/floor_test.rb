# frozen_string_literal: true

require_relative '../test_helper'

class FloorDefinitionTest < Minitest::Test
  FloorDefinition = JiraNot::ConstructFlow::Architecture::FloorDefinition

  def test_floor_calculates_net_area_and_perimeter_with_hole
    floor = FloorDefinition.new(
      boundary_mm: [[0, 0, 0], [4_000, 0, 0], [4_000, 3_000, 0], [0, 3_000, 0]],
      holes_mm: [[[1_000, 1_000, 0], [2_000, 1_000, 0], [2_000, 2_000, 0], [1_000, 2_000, 0]]],
      level_id: 'ground', thickness_mm: 150
    )

    assert floor.valid?
    assert_in_delta 11_000_000.0, floor.net_area_mm2, 0.001
    assert_in_delta 18_000.0, floor.perimeter_mm, 0.001
  end

  def test_floor_rejects_zero_thickness_and_outside_hole
    floor = FloorDefinition.new(
      boundary_mm: [[0, 0, 0], [1_000, 0, 0], [1_000, 1_000, 0]],
      holes_mm: [[[1_100, 900, 0], [1_200, 900, 0], [1_100, 1_000, 0]]],
      thickness_mm: 0
    )

    refute floor.valid?
    assert_includes floor.errors, 'floor thickness must be greater than zero'
    assert_includes floor.errors, 'floor hole 1 lies outside boundary'
  end

  def test_floor_round_trips_domain_payload
    floor = FloorDefinition.new(boundary_mm: [[0, 0, 0], [2_000, 0, 0], [2_000, 2_000, 0]], level_id: 'L1', offset_mm: 25)

    assert_equal floor.to_h, FloorDefinition.from_h(floor.to_h).to_h
  end

  def test_floor_quantity_provider_is_traceable
    entity = FakeEntity.new
    object = JiraNot::ConstructFlow::Core::SmartObject.new(
      entity: entity, id: 'floor-1', type: 'architecture.floor', owner_module: 'constructflow.architecture',
      schema_version: 1, display_name: 'Floor', created_phase: 'new_construction', removed_phase: nil,
      level_refs: [], status: 'active', relationships: [], geometry_refs: [], catalog_ref: nil,
      source_state: 'confirmed', revision_meta: {}, created_at: nil, updated_at: nil
    )
    definition = FloorDefinition.new(boundary_mm: [[0, 0, 0], [2000, 0, 0], [2000, 2000, 0], [0, 2000, 0]], thickness_mm: 150)

    items = JiraNot::ConstructFlow::Architecture::Quantity::FloorQuantityProvider.new.quantities(
      smart_object: object, definition: definition
    )

    assert_equal 'floor-1', items.first[:source_object_id]
    assert_equal 'architecture.floor.net_area', items.first[:classification]
    assert_in_delta 4.0, items.first[:value], 0.001
  end
end
