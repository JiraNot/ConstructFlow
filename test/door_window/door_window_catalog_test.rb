# frozen_string_literal: true

require_relative '../test_helper'

class DoorWindowCatalogTest < Minitest::Test
  DoorWindow = JiraNot::ConstructFlow::DoorWindow

  def test_catalog_has_thirty_five_valid_entries
    assert_operator DoorWindow::Catalog.size, :>=, 30
    DoorWindow::Catalog.all.each do |entry|
      type = DoorWindow::Catalog.build_type(entry[:id])
      assert type.valid?, "#{entry[:id]} invalid: #{type.errors.join('; ')}"
      assert_equal entry[:name], type.name
    end
  end

  def test_catalog_covers_showcase_operations
    ids = DoorWindow::Catalog.all.map { |entry| entry[:id] }
    %w[D-SL2 D-SL3 D-SL4 D-FR2 D-RS1 D-PV1 W-CS2 W-AW1 W-HP1 W-LV1 W-SH1 SF-GL2 MS-SL2].each do |expected|
      assert_includes ids, expected
    end
  end

  def test_build_type_applies_dimension_and_parameter_overrides
    type = DoorWindow::Catalog.build_type(
      'D-SL2', width_mm: 2000, height_mm: 2200, frame_depth_mm: 150,
      leaf_thickness_mm: 50, mullion_width_mm: 60, louver_spacing_mm: 100
    )
    assert_equal 2000.0, type.width_mm
    assert_equal 2200.0, type.height_mm
    assert_equal 150.0, type.frame_depth_mm
    assert_equal 50.0, type.leaf_thickness_mm
    assert_equal 60.0, type.mullion_width_mm
    assert_equal 100.0, type.louver_spacing_mm
  end

  def test_build_type_rejects_unknown_id
    assert_raises(ArgumentError) { DoorWindow::Catalog.build_type('NOPE-999') }
  end

  def test_ensure_registered_is_idempotent_and_registrable
    model = FakeModel.new
    registry = DoorWindow::TypeRegistry.new(model)

    first = DoorWindow::Catalog.ensure_registered!(registry)
    assert_equal DoorWindow::Catalog.size, first.size
    assert_equal DoorWindow::Catalog.size, registry.size

    second = DoorWindow::Catalog.ensure_registered!(registry)
    assert_empty second
  end

  def test_catalog_types_resolve_parametric_parameters
    type = DoorWindow::Catalog.build_type('D-SL2')
    params = type.parametric_parameters
    assert_equal type.width_mm - (2.0 * type.frame_width_mm), params['clear_width']
    assert_equal type.height_mm - (2.0 * type.frame_width_mm), params['clear_height']
  end
end
