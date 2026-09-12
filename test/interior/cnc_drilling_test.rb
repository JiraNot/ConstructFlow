# frozen_string_literal: true

require_relative '../test_helper'

INTERIOR_TEST_ROOT ||= File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'interior')
require File.join(INTERIOR_TEST_ROOT, 'cabinet_run_definition')
require File.join(INTERIOR_TEST_ROOT, 'joinery_part_set_definition')
require File.join(INTERIOR_TEST_ROOT, 'joinery_part_generator')
require File.join(INTERIOR_TEST_ROOT, 'cnc_operation_generator')

class CncDrillingTest < Minitest::Test
  Interior = JiraNot::ConstructFlow::Interior

  def setup
    @cabinet = Interior::CabinetRunDefinition.new(
      origin_mm: [0, 0, 0],
      width_mm: 1200,
      height_mm: 800,
      depth_mm: 600,
      board_thickness_mm: 18,
      back_thickness_mm: 9,
      toe_kick_mm: 100,
      carcass_material_id: 'board.hmr.18'
    ).split_equal(count: 2)
     .assign_front(module_id: 'M01', front_type: 'single_swing', style: 'flat')

    @part_set = Interior::JoineryPartGenerator.new.generate(
      cabinet_object_id: 'cab-cnc',
      definition: @cabinet
    )
    @generator = Interior::CncOperationGenerator.new
  end

  def test_cnc_generator_produces_operations_summary
    result = @generator.generate(@part_set, cabinet_definition: @cabinet)

    assert_equal 'cab-cnc', result[:cabinet_object_id]
    assert_operator result[:total_operations], :>, 0
    assert_operator result[:parts].length, :>=, 4
  end

  def test_side_panels_have_system32_and_grooves
    result = @generator.generate(@part_set, cabinet_definition: @cabinet)
    side = result[:parts].find { |p| p[:role] == 'side_left' }

    assert side, 'side_left panel should have operations'
    ops = side[:operations]

    s32_holes = ops.select { |o| o[:tool] == 'shelf_pin_drill_5mm' }
    assert_operator s32_holes.length, :>=, 10
    assert_equal 5.0, s32_holes.first[:diameter_mm]
    assert_equal 37.0, s32_holes.first[:x_mm]

    grooves = ops.select { |o| o[:type] == 'groove' }
    assert_equal 1, grooves.length
    assert_equal 9.0, grooves.first[:width_mm]
  end

  def test_door_has_35mm_hinge_cup_and_pilots
    result = @generator.generate(@part_set, cabinet_definition: @cabinet)
    door = result[:parts].find { |p| p[:role] == 'front' }

    assert door, 'door should have operations'
    cups = door[:operations].select { |o| o[:tool] == 'hinge_cup_forstner_35mm' }
    assert_equal 2, cups.length
    assert_equal 35.0, cups.first[:diameter_mm]
    assert_equal 21.5, cups.first[:x_mm]

    pilots = door[:operations].select { |o| o[:tool] == 'pilot_drill_2_5mm' }
    assert_equal 4, pilots.length
  end

  def test_top_and_bottom_panels_have_minifix_cams_and_edge_drilling
    result = @generator.generate(@part_set, cabinet_definition: @cabinet)
    top = result[:parts].find { |p| p[:role] == 'top' }

    assert top, 'top panel should have operations'
    cams = top[:operations].select { |o| o[:tool] == 'minifix_cam_drill_15mm' }
    assert_equal 4, cams.length
    assert_equal 15.0, cams.first[:diameter_mm]

    edge_holes = top[:operations].select { |o| o[:tool] == 'dowel_drill_8mm' }
    assert_equal 4, edge_holes.length
    assert_equal 8.0, edge_holes.first[:diameter_mm]
  end
end
