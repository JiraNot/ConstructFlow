# frozen_string_literal: true

require_relative '../test_helper'

class RoomDefinitionTest < Minitest::Test
  RoomDefinition = JiraNot::ConstructFlow::Architecture::RoomDefinition

  def test_room_tracks_area_perimeter_and_program
    room = RoomDefinition.new(
      boundary_mm: [[0, 0, 0], [4_000, 0, 0], [4_000, 3_000, 0], [0, 3_000, 0]],
      name: 'Kitchen', number: 'K-01', program: 'kitchen',
      finish_metadata: { floor: 'tile', wall: 'paint' }
    )

    assert room.valid?
    assert_in_delta 12_000_000.0, room.area_mm2, 0.001
    assert_in_delta 14_000.0, room.perimeter_mm, 0.001
    assert_equal 'tile', room.finish_metadata['floor']
  end

  def test_room_requires_name_or_number
    room = RoomDefinition.new(
      boundary_mm: [[0, 0, 0], [1_000, 0, 0], [1_000, 1_000, 0]],
      name: '', number: ''
    )

    refute room.valid?
    assert_includes room.errors, 'room name or number is required'
  end

  def test_room_payload_round_trip
    room = RoomDefinition.new(
      boundary_mm: [[0, 0, 0], [2_000, 0, 0], [2_000, 2_000, 0]],
      level_id: 'L1', name: 'Bath', number: 'B-01', program: 'bathroom'
    )

    assert_equal room.to_h, RoomDefinition.from_h(room.to_h).to_h
  end

  def test_room_quantity_provider_reports_area_and_perimeter
    object = JiraNot::ConstructFlow::Core::SmartObject.new(
      entity: FakeEntity.new, id: 'room-1', type: 'architecture.room', owner_module: 'constructflow.architecture',
      schema_version: 1, display_name: 'Room', created_phase: 'new_construction', removed_phase: nil,
      level_refs: [], status: 'active', relationships: [], geometry_refs: [], catalog_ref: nil,
      source_state: 'confirmed', revision_meta: {}, created_at: nil, updated_at: nil
    )
    room = RoomDefinition.new(boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]], name: 'Kitchen')

    items = JiraNot::ConstructFlow::Architecture::Quantity::RoomQuantityProvider.new.quantities(
      smart_object: object, definition: room
    )

    assert_equal 2, items.length
    assert_in_delta 12.0, items.first[:value], 0.001
    assert_equal 'm', items.last[:unit]
  end
end
