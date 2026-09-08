# frozen_string_literal: true

require_relative '../test_helper'

class SurfaceDomainTest < Minitest::Test
  SmartObjectStub = Struct.new(
    :id, :created_phase, :removed_phase, :source_state,
    keyword_init: true
  )

  def concave_surface
    JiraNot::ConstructFlow::Surface::SurfaceDefinition.new(
      outer_boundary_mm: [
        [0, 0, 0], [6000, 0, 0], [6000, 4000, 0],
        [3500, 4000, 0], [3500, 2500, 0], [0, 2500, 0]
      ],
      holes_mm: [[[1000, 800, 0], [1800, 800, 0], [1800, 1600, 0], [1000, 1600, 0]]],
      surface_type: 'paver'
    )
  end

  def smart_object(id)
    SmartObjectStub.new(
      id: id,
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil,
      source_state: 'confirmed'
    )
  end

  def test_concave_boundary_with_hole_is_valid_and_traceable
    surface = concave_surface
    assert surface.valid?, surface.errors.join(', ')
    assert_operator surface.outer_area_mm2, :>, surface.net_area_mm2
    assert_in_delta 640_000.0, surface.holes_area_mm2, 0.001
    assert_operator surface.perimeter_mm, :>, 0

    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Surface::Repository.new
    repository.write_surface(entity, surface)
    assert_equal surface.to_h, repository.read_surface(entity).to_h
  end

  def test_self_intersecting_boundary_is_rejected
    surface = JiraNot::ConstructFlow::Surface::SurfaceDefinition.new(
      outer_boundary_mm: [[0, 0, 0], [3000, 3000, 0], [0, 3000, 0], [3000, 0, 0]],
      surface_type: 'tile'
    )

    refute surface.valid?
    assert_includes surface.errors, 'surface boundary is self-intersecting'
  end

  def test_pattern_coordinate_system_is_independent_from_boundary
    surface = concave_surface
    pattern = JiraNot::ConstructFlow::Surface::PatternDefinition.new(
      surface_object_id: 'cf_surface_1',
      pattern: 'herringbone',
      origin_mm: [500, 500, 0],
      angle_deg: 45,
      module_mm: [200, 100],
      joint_mm: 3,
      minimum_cut_mm: 40
    )

    assert pattern.valid?
    basis = pattern.basis
    assert_in_delta Math.sqrt(0.5), basis[:primary][0], 0.0001
    assert_in_delta Math.sqrt(0.5), basis[:primary][1], 0.0001
    assert_operator pattern.provisional_piece_count(surface.net_area_mm2), :>, 0
  end

  def test_border_follows_semantic_surface_perimeter
    surface = concave_surface
    border = JiraNot::ConstructFlow::Surface::BorderDefinition.new(
      surface_object_id: 'cf_surface_1',
      width_mm: 200,
      material_id: 'stone.dark',
      follow_holes: true
    )

    assert border.valid?
    expected = (surface.perimeter_mm + surface.hole_perimeter_mm) * 200.0
    assert_in_delta expected, border.approximate_area_mm2(surface), 0.001
  end

  def test_three_bay_parking_layout_preserves_three_explicit_bays
    parking = JiraNot::ConstructFlow::Surface::ParkingLayoutDefinition.new(
      surface_object_id: 'cf_surface_1',
      origin_mm: [0, 0, 0],
      bay_count: 3,
      bay_width_mm: 2500,
      bay_length_mm: 5000,
      divider_width_mm: 100,
      angle_deg: 0
    )

    assert parking.valid?
    assert_equal 3, parking.bay_boundaries_mm.length
    assert_equal 2, parking.divider_centerlines_mm.length
    assert_in_delta 7700.0, parking.total_width_mm, 0.001
    assert_in_delta 38_500_000.0, parking.footprint_area_mm2, 0.001
  end

  def test_surface_and_pattern_quantities_are_explicitly_preliminary
    surface = concave_surface
    pattern = JiraNot::ConstructFlow::Surface::PatternDefinition.new(
      surface_object_id: 'cf_surface_1',
      pattern: 'grid',
      module_mm: [300, 300],
      joint_mm: 3
    )
    provider = JiraNot::ConstructFlow::Surface::Quantity::SurfaceQuantityProvider.new
    area = provider.surface_quantities(smart_object: smart_object('cf_surface_1'), definition: surface)
                   .find { |item| item[:measure] == 'area' }
    pieces = provider.pattern_quantities(
      smart_object: smart_object('cf_pattern_1'),
      definition: pattern,
      surface_definition: surface
    ).first

    assert_equal 'm2', area[:unit]
    assert_equal 'constructflow.surface', area[:source_module]
    assert_equal 'pcs', pieces[:unit]
    assert_equal 'preliminary_area_based', pieces[:breakdown][:quantity_status]
  end

  def test_european_fan_radial_and_follow_path_are_valid_pattern_types
    %w[european_fan radial concentric follow_path].each do |pattern_name|
      pattern = JiraNot::ConstructFlow::Surface::PatternDefinition.new(
        surface_object_id: 'cf_surface_1',
        pattern: pattern_name,
        module_mm: [200, 200]
      )
      assert pattern.valid?, "expected #{pattern_name} to be accepted"
    end
  end
end
