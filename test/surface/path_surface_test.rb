# frozen_string_literal: true

require_relative '../test_helper'

class PathSurfaceTest < Minitest::Test
  Surface = JiraNot::ConstructFlow::Surface

  def test_path_boundary_generation_straight_line
    path = Surface::PathSurfaceDefinition.new(
      centerline_mm: [[0, 0, 0], [10_000, 0, 0]],
      width_mm: 1200.0,
      surface_type: 'paver'
    )

    assert path.valid?
    assert_in_delta 10_000.0, path.length_mm, 0.01

    boundary = path.compute_boundary_loop
    # 2 segments on left + 2 on right = 4 points forming rectangle
    assert_equal 4, boundary.length
    # Normal is [0, 1], so left points at y=+600, right points at y=-600
    assert_in_delta 600.0, boundary[0][1], 0.01
    assert_in_delta 600.0, boundary[1][1], 0.01
    assert_in_delta(-600.0, boundary[2][1], 0.01)
    assert_in_delta(-600.0, boundary[3][1], 0.01)

    surface_def = path.to_surface_definition
    assert surface_def.valid?
    assert_in_delta 12_000_000.0, surface_def.net_area_mm2, 1.0 # 10m x 1.2m = 12m2
  end

  def test_path_boundary_generation_l_shape
    path = Surface::PathSurfaceDefinition.new(
      centerline_mm: [[0, 0, 0], [5000, 0, 0], [5000, 5000, 0]],
      width_mm: 1000.0
    )

    assert path.valid?
    assert_in_delta 10_000.0, path.length_mm, 0.01

    boundary = path.compute_boundary_loop
    assert_equal 6, boundary.length # 3 points on each side

    surface_def = path.to_surface_definition
    assert surface_def.valid?
    assert_operator surface_def.net_area_mm2, :>, 0.0
  end
end
