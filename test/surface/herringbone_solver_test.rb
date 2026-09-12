# frozen_string_literal: true

require_relative '../test_helper'

class HerringboneSolverTest < Minitest::Test
  Surface = JiraNot::ConstructFlow::Surface

  def setup
    @solver = Surface::LayoutSolver.new
  end

  def test_herringbone_covers_rectangular_surface_completely
    surface = square_surface(1000)
    pattern = pattern_for('herringbone', module_mm: [200, 100], joint_mm: 0)

    layout = @solver.solve(
      surface_definition: surface,
      pattern_definition: pattern,
      pattern_object_id: 'pattern-hb-1'
    )

    assert layout.solved?, layout.warnings.join(', ')
    assert_in_delta surface.net_area_mm2, layout.visible_area_mm2, 0.01
    assert_operator layout.piece_count, :>, 0
    assert_operator layout.full_count, :>, 0
    assert_operator layout.cut_count, :>, 0

    has_h = layout.pieces.any? { |p| p['id'].include?('_h') }
    has_v = layout.pieces.any? { |p| p['id'].include?('_v') }
    assert has_h, 'Expected horizontal herringbone pieces'
    assert has_v, 'Expected vertical herringbone pieces'
  end

  def test_herringbone_with_joint_gap_solved
    surface = square_surface(1200)
    pattern = pattern_for('herringbone', module_mm: [200, 100], joint_mm: 5)

    layout = @solver.solve(
      surface_definition: surface,
      pattern_definition: pattern,
      pattern_object_id: 'pattern-hb-2'
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

  def pattern_for(name, module_mm:, joint_mm: 0, minimum_cut_mm: 30)
    Surface::PatternDefinition.new(
      surface_object_id: 'surface-1',
      pattern: name,
      origin_mm: [0, 0, 0],
      angle_deg: 0,
      module_mm: module_mm,
      joint_mm: joint_mm,
      minimum_cut_mm: minimum_cut_mm
    )
  end
end
