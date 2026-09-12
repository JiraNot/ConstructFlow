# frozen_string_literal: true

require_relative '../test_helper'

class TreePitTest < Minitest::Test
  Surface = JiraNot::ConstructFlow::Surface

  def test_square_tree_pit_hole_loop
    pit = Surface::TreePitDefinition.new(
      surface_object_id: 'surf-1',
      shape: 'square',
      center_point_mm: [1500, 1500, 0],
      width_mm: 1000.0,
      length_mm: 1000.0,
      grille: true
    )

    assert pit.valid?
    assert_in_delta 1_000_000.0, pit.area_mm2, 0.01

    loop = pit.to_hole_loop
    assert_equal 4, loop.length
    assert_equal [1000.0, 1000.0, 0], loop[0]
    assert_equal [2000.0, 1000.0, 0], loop[1]
    assert_equal [2000.0, 2000.0, 0], loop[2]
    assert_equal [1000.0, 2000.0, 0], loop[3]
  end

  def test_circular_tree_pit_hole_loop
    pit = Surface::TreePitDefinition.new(
      surface_object_id: 'surf-1',
      shape: 'circle',
      center_point_mm: [2000, 2000, 0],
      radius_mm: 600.0
    )

    assert pit.valid?
    assert_in_delta Math::PI * 600.0 * 600.0, pit.area_mm2, 0.01

    loop = pit.to_hole_loop(8)
    assert_equal 8, loop.length
  end

  def test_tree_pit_subtracted_from_surface_area
    surface = Surface::SurfaceDefinition.new(
      outer_boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 4000, 0], [0, 4000, 0]],
      surface_type: 'paver'
    )
    pit = Surface::TreePitDefinition.new(
      surface_object_id: 'surf-1',
      center_point_mm: [2000, 2000, 0],
      width_mm: 1000.0,
      length_mm: 1000.0
    )

    updated_surface = surface.with(holes_mm: surface.holes_mm + [pit.to_hole_loop])

    assert updated_surface.valid?
    assert_in_delta 16_000_000.0, updated_surface.outer_area_mm2, 0.01
    assert_in_delta 1_000_000.0, updated_surface.holes_area_mm2, 0.01
    assert_in_delta 15_000_000.0, updated_surface.net_area_mm2, 0.01
  end
end
