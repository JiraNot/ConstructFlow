# frozen_string_literal: true

require_relative '../test_helper'

class ChevronSolverTest < Minitest::Test
  Surface = JiraNot::ConstructFlow::Surface

  def setup
    @solver = Surface::LayoutSolver.new
  end

  def test_chevron_covers_surface_completely
    surface = square_surface(1000)
    pattern = pattern_for('chevron', module_mm: [200, 100], joint_mm: 0)

    layout = @solver.solve(
      surface_definition: surface,
      pattern_definition: pattern,
      pattern_object_id: 'pattern-ch-1'
    )

    assert layout.solved?, layout.warnings.join(', ')
    assert_in_delta surface.net_area_mm2, layout.visible_area_mm2, 0.01
    assert_operator layout.piece_count, :>, 0
    assert_operator layout.full_count, :>, 0
  end

  def test_chevron_with_rotation_and_joint
    surface = square_surface(1200)
    pattern = pattern_for('chevron', module_mm: [200, 100], joint_mm: 3, angle_deg: 45)

    layout = @solver.solve(
      surface_definition: surface,
      pattern_definition: pattern,
      pattern_object_id: 'pattern-ch-2'
    )

    assert layout.solved?, layout.warnings.join(', ')
    assert_operator layout.piece_count, :>, 0
  end

  private

  def square_surface(size)
    Surface::SurfaceDefinition.new(
      outer_boundary_mm: [[0, 0, 0], [size, 0, 0], [size, size, 0], [0, size, 0]],
      surface_type: 'paver'
    )
  end

  def pattern_for(name, module_mm:, joint_mm: 0, angle_deg: 0, minimum_cut_mm: 30)
    Surface::PatternDefinition.new(
      surface_object_id: 'surface-1',
      pattern: name,
      origin_mm: [0, 0, 0],
      angle_deg: angle_deg,
      module_mm: module_mm,
      joint_mm: joint_mm,
      minimum_cut_mm: minimum_cut_mm
    )
  end
end
