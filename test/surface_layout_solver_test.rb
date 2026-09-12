# frozen_string_literal: true

require_relative 'test_helper'

class SurfaceLayoutSolverTest < Minitest::Test
  Surface = JiraNot::ConstructFlow::Surface

  def setup
    @solver = Surface::LayoutSolver.new
  end

  def test_exact_grid_produces_four_full_pieces
    surface = square_surface(1000)
    pattern = pattern_for('grid', module_mm: [500, 500])

    layout = @solver.solve(
      surface_definition: surface,
      pattern_definition: pattern,
      pattern_object_id: 'pattern-1'
    )

    assert layout.solved?
    assert_equal 4, layout.piece_count
    assert_equal 4, layout.full_count
    assert_equal 0, layout.cut_count
    assert_in_delta 1_000_000.0, layout.visible_area_mm2, 0.01
    assert_in_delta 1.0, layout.coverage_ratio(surface.net_area_mm2), 1.0e-9
  end

  def test_partial_grid_reports_real_cut_pieces
    surface = square_surface(900)
    pattern = pattern_for('grid', module_mm: [500, 500])

    layout = solve(surface, pattern)

    assert_equal 4, layout.piece_count
    assert_equal 1, layout.full_count
    assert_equal 3, layout.cut_count
    assert_in_delta surface.net_area_mm2, layout.visible_area_mm2, 0.01
    assert_operator layout.cut_waste_area_mm2, :>, 0
  end

  def test_hole_is_subtracted_from_piece_coverage
    surface = Surface::SurfaceDefinition.new(
      outer_boundary_mm: loop3d([[0, 0], [1000, 0], [1000, 1000], [0, 1000]]),
      holes_mm: [loop3d([[250, 250], [750, 250], [750, 750], [250, 750]])],
      surface_type: 'tile'
    )
    layout = solve(surface, pattern_for('grid', module_mm: [500, 500]))

    assert layout.solved?
    assert_equal 4, layout.cut_count
    assert_equal 0, layout.full_count
    assert_in_delta 750_000.0, layout.visible_area_mm2, 0.01
    assert_in_delta surface.net_area_mm2, layout.visible_area_mm2, 0.01
    assert layout.pieces.all? { |piece| !piece['void_fragments_mm'].empty? }
  end

  def test_concave_boundary_is_triangulated_and_clipped
    surface = Surface::SurfaceDefinition.new(
      outer_boundary_mm: loop3d([[0, 0], [1000, 0], [1000, 400], [400, 400], [400, 1000], [0, 1000]]),
      surface_type: 'paver'
    )
    layout = solve(surface, pattern_for('grid', module_mm: [250, 250]))

    assert layout.solved?, layout.warnings.join(', ')
    assert_in_delta surface.net_area_mm2, layout.visible_area_mm2, 0.01
    assert_operator layout.piece_count, :>, 0
  end

  def test_rotated_grid_still_covers_surface_without_joint_gap
    surface = square_surface(1200)
    pattern = Surface::PatternDefinition.new(
      surface_object_id: 'surface-1',
      pattern: 'diagonal',
      origin_mm: [600, 600, 0],
      angle_deg: 45,
      module_mm: [300, 300],
      joint_mm: 0,
      minimum_cut_mm: 50
    )
    layout = solve(surface, pattern)

    assert layout.solved?
    assert_in_delta surface.net_area_mm2, layout.visible_area_mm2, 0.1
    assert_in_delta 1.0, layout.coverage_ratio(surface.net_area_mm2), 1.0e-7
    assert_operator layout.cut_count, :>, 0
  end

  def test_running_bond_offsets_odd_rows
    surface = square_surface(1000)
    layout = solve(surface, pattern_for('running_bond', module_mm: [500, 500]))

    row_zero = layout.pieces.select { |piece| piece['row'] == 0 }
    row_one = layout.pieces.select { |piece| piece['row'] == 1 }
    assert row_zero.any?
    assert row_one.any?
    assert row_zero.any? { |piece| piece['cell_local_mm'][0] == 0.0 }
    assert row_one.any? { |piece| (piece['cell_local_mm'][0] % 500.0 - 250.0).abs < 1.0e-6 }
  end

  def test_minimum_cut_rule_is_reported
    surface = square_surface(520)
    pattern = pattern_for('grid', module_mm: [500, 500], minimum_cut_mm: 100)
    layout = solve(surface, pattern)

    assert_operator layout.minimum_cut_violations.length, :>, 0
    assert layout.warnings.any? { |warning| warning.include?('minimum cut') }
  end

  def test_unsupported_pattern_is_explicit_not_fake_solved
    layout = solve(square_surface(1000), pattern_for('modular', module_mm: [200, 100]))

    refute layout.solved?
    assert_equal 'unsupported', layout.status
    assert layout.warnings.first.include?('does not support')
  end

  def test_layout_persists_on_pattern_entity
    entity = FakeEntity.new
    repository = Surface::Repository.new
    layout = solve(square_surface(1000), pattern_for('grid', module_mm: [500, 500]))

    repository.write_layout(entity, layout)
    restored = repository.read_layout(entity)

    assert_equal layout.piece_count, restored.piece_count
    assert_equal layout.full_count, restored.full_count
    assert_equal layout.to_h, restored.to_h
  end

  def test_quantity_provider_uses_solved_piece_counts
    surface = square_surface(900)
    pattern = pattern_for('grid', module_mm: [500, 500])
    layout = solve(surface, pattern)
    smart_object = Struct.new(:id, :removed_phase, :created_phase, :source_state).new(
      'pattern-1', nil, JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION, 'confirmed'
    )
    provider = Surface::Quantity::SurfaceQuantityProvider.new

    items = provider.pattern_quantities(
      smart_object: smart_object,
      definition: pattern.with(layout_state: 'locked'),
      surface_definition: surface,
      layout_definition: layout
    )

    total = items.find { |item| item[:classification].end_with?('.modules.total') }
    cut = items.find { |item| item[:classification].end_with?('.modules.cut') }
    waste = items.find { |item| item[:classification] == 'surface.pattern.cut_waste_area' }
    assert_equal 4, total[:value]
    assert_equal 3, cut[:value]
    assert_operator waste[:value], :>, 0
    assert_equal 'solved_piece_layout', total[:breakdown][:quantity_status]
  end

  private

  def solve(surface, pattern)
    @solver.solve(
      surface_definition: surface,
      pattern_definition: pattern,
      pattern_object_id: 'pattern-1'
    )
  end

  def square_surface(size)
    Surface::SurfaceDefinition.new(
      outer_boundary_mm: loop3d([[0, 0], [size, 0], [size, size], [0, size]]),
      surface_type: 'tile'
    )
  end

  def pattern_for(name, module_mm:, minimum_cut_mm: 50)
    Surface::PatternDefinition.new(
      surface_object_id: 'surface-1',
      pattern: name,
      origin_mm: [0, 0, 0],
      angle_deg: 0,
      module_mm: module_mm,
      joint_mm: 0,
      minimum_cut_mm: minimum_cut_mm
    )
  end

  def loop3d(points)
    points.map { |x, y| [x, y, 0] }
  end
end
