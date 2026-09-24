# frozen_string_literal: true

require_relative '../test_helper'

class DoorWindowUserFavoritesTest < Minitest::Test
  DoorWindow = JiraNot::ConstructFlow::DoorWindow

  def model
    @model ||= FakeModel.new
  end

  def sample_type
    DoorWindow::DoorWindowType.new(
      id: 'D-SL2', name: 'ประตูบานเลื่อน 2 บาน', category: 'door', operation: 'sliding',
      width_mm: 1800, height_mm: 2100, frame_width_mm: 45, frame_depth_mm: 120,
      leaf_thickness_mm: 45, mullion_width_mm: 45
    )
  end

  def test_save_and_round_trip_preserves_construction_parameters
    saved_id = DoorWindow::UserFavorites.save(model, 'USER:ประตูหน้าบ้าน', sample_type)
    assert_equal 'USER:ประตูหน้าบ้าน', saved_id

    rebuilt = DoorWindow::UserFavorites.build_type(model, 'USER:ประตูหน้าบ้าน')
    refute_nil rebuilt
    assert_equal 'ประตูบานเลื่อน 2 บาน', rebuilt.name
    assert_equal 'sliding', rebuilt.operation
    assert_equal 1800.0, rebuilt.width_mm
    assert_equal 2100.0, rebuilt.height_mm
    assert_equal 120.0, rebuilt.frame_depth_mm
    assert_equal 45.0, rebuilt.leaf_thickness_mm
    assert_equal 45.0, rebuilt.mullion_width_mm
    assert rebuilt.valid?
  end

  def test_save_rejects_invalid_type_and_blank_id
    assert_raises(ArgumentError) { DoorWindow::UserFavorites.save(model, '', sample_type) }
    broken = DoorWindow::DoorWindowType.new(
      id: 'X', category: 'door', operation: 'swing', width_mm: -5, height_mm: 2000
    )
    assert_raises(ArgumentError) { DoorWindow::UserFavorites.save(model, 'USER:x', broken) }
  end

  def test_delete_returns_false_for_missing_favorite
    DoorWindow::UserFavorites.save(model, 'USER:a', sample_type)
    assert_equal true, DoorWindow::UserFavorites.delete(model, 'USER:a')
    assert_equal false, DoorWindow::UserFavorites.delete(model, 'USER:a')
    assert_equal 0, DoorWindow::UserFavorites.count(model)
  end

  def test_next_id_generates_unique_sequential_ids
    assert_equal 'USER:ประตู', DoorWindow::UserFavorites.next_id(model, 'ประตู')
    DoorWindow::UserFavorites.save(model, 'USER:ประตู', sample_type)
    assert_equal 'USER:ประตู-2', DoorWindow::UserFavorites.next_id(model, 'ประตู')
    DoorWindow::UserFavorites.save(model, 'USER:ประตู-2', sample_type)
    assert_equal 'USER:ประตู-3', DoorWindow::UserFavorites.next_id(model, 'ประตู')
  end

  def test_all_returns_sorted_entries
    DoorWindow::UserFavorites.save(model, 'USER:b', sample_type)
    DoorWindow::UserFavorites.save(model, 'USER:a', sample_type)
    ids = DoorWindow::UserFavorites.all(model).map(&:first)
    assert_equal %w[USER:a USER:b], ids
  end

  def test_favorite_type_resolution_from_placement_input
    DoorWindow::UserFavorites.save(model, 'USER:mydoor', sample_type)
    registry = DoorWindow::TypeRegistry.new(model)

    type = DoorWindow::Registration.send(
      :preview_type, { type_id: 'USER:mydoor' }, registry, { width_mm: 1000, height_mm: 2000 }
    )
    assert_equal 'USER:mydoor', type.id
    assert_equal 120.0, type.frame_depth_mm
  end
end
