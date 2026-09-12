# frozen_string_literal: true

require_relative '../test_helper'

INTERIOR_TEST_ROOT ||= File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'interior')
require File.join(INTERIOR_TEST_ROOT, 'cabinet_run_definition')
require File.join(INTERIOR_TEST_ROOT, 'joinery_part_set_definition')
require File.join(INTERIOR_TEST_ROOT, 'joinery_part_generator')
require File.join(INTERIOR_TEST_ROOT, 'nesting_result_definition')
require File.join(INTERIOR_TEST_ROOT, 'sheet_nesting_engine')

class SheetNestingTest < Minitest::Test
  Interior = JiraNot::ConstructFlow::Interior

  def setup
    @cabinet = Interior::CabinetRunDefinition.new(
      origin_mm: [0, 0, 0],
      width_mm: 1800,
      height_mm: 800,
      depth_mm: 600,
      board_thickness_mm: 18,
      back_thickness_mm: 9,
      toe_kick_mm: 100,
      carcass_material_id: 'board.hmr.18'
    ).split_equal(count: 3)
     .assign_front(module_id: 'M01', front_type: 'single_swing', style: 'flat')
     .assign_front(module_id: 'M02', front_type: 'double_swing', style: 'flat')
     .add_drawer_set(module_id: 'M03', count: 3, slide_type: 'soft_close')

    @part_set = Interior::JoineryPartGenerator.new.generate(
      cabinet_object_id: 'cab-01',
      definition: @cabinet
    )
    @engine = Interior::SheetNestingEngine.new
  end

  def test_sheet_nesting_packs_all_parts_with_positive_utilization
    result = @engine.nest(cabinet_object_id: 'cab-01', part_set: @part_set)

    assert result.valid?, result.errors.join(', ')
    assert_empty result.unplaced_parts
    assert_operator result.total_sheets, :>=, 1
    assert_operator result.overall_utilization_pct, :>, 0.0
    assert_operator result.overall_utilization_pct, :<=, 100.0
    assert_in_delta 100.0, result.overall_utilization_pct + result.scrap_pct, 0.01

    # Check bounds of every placed part
    result.sheets.each do |sheet|
      sheet['placed_parts'].each do |p|
        x = p['x_mm']
        y = p['y_mm']
        len = p['length_mm']
        wid = p['width_mm']

        assert_operator x, :>=, result.trim_margin_mm
        assert_operator y, :>=, result.trim_margin_mm
        assert_operator x + len, :<=, result.sheet_length_mm - result.trim_margin_mm + 0.01
        assert_operator y + wid, :<=, result.sheet_width_mm - result.trim_margin_mm + 0.01
      end
    end
  end

  def test_different_materials_and_thicknesses_are_separated
    result = @engine.nest(cabinet_object_id: 'cab-01', part_set: @part_set)

    result.sheets.each do |sheet|
      thick = sheet['thickness_mm']
      mat = sheet['material_id']
      sheet['placed_parts'].each do |part|
        assert_equal thick, part['thickness_mm']
      end
    end

    # 18mm carcass and 9mm back panel must be on distinct sheets
    thicknesses = result.sheets.map { |s| s['thickness_mm'] }.uniq
    assert_includes thicknesses, 18.0
    assert_includes thicknesses, 9.0
  end

  def test_grain_direction_constraint_strictly_enforced
    # Create parts where grain is 'length'
    parts = [
      {
        'id' => 'p1',
        'role' => 'side',
        'length_mm' => 1500,
        'width_mm' => 500,
        'thickness_mm' => 18,
        'material_id' => 'board.woodgrain',
        'grain_direction' => 'length'
      }
    ]

    result = @engine.nest(cabinet_object_id: 'cab-grain', part_set: parts)
    placed = result.sheets.first['placed_parts'].first

    refute placed['rotated'], 'grain length part should not be rotated'
    assert_equal 1500.0, placed['length_mm']
    assert_equal 500.0, placed['width_mm']
  end

  def test_oversized_part_is_reported_unplaced
    oversized = [
      {
        'id' => 'huge_panel',
        'role' => 'wall',
        'length_mm' => 3000,
        'width_mm' => 2000,
        'thickness_mm' => 18,
        'material_id' => 'board.hmr.18',
        'grain_direction' => 'none'
      }
    ]

    result = @engine.nest(cabinet_object_id: 'cab-huge', part_set: oversized)
    assert_equal 1, result.unplaced_parts.length
    assert_equal 'huge_panel', result.unplaced_parts.first['id']
  end
end
