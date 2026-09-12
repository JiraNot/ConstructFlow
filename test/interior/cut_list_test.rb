# frozen_string_literal: true

require_relative '../test_helper'

INTERIOR_TEST_ROOT ||= File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'interior')
require File.join(INTERIOR_TEST_ROOT, 'cabinet_run_definition')
require File.join(INTERIOR_TEST_ROOT, 'joinery_part_set_definition')
require File.join(INTERIOR_TEST_ROOT, 'joinery_part_generator')
require File.join(INTERIOR_TEST_ROOT, 'cut_list_exporter')

class CutListTest < Minitest::Test
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
     .add_drawer_set(module_id: 'M02', count: 2, slide_type: 'soft_close')

    @part_set = Interior::JoineryPartGenerator.new.generate(
      cabinet_object_id: 'cab-02',
      definition: @cabinet
    )
    @exporter = Interior::CutListExporter.new
  end

  def test_cut_list_calculates_edge_banding_deductions
    export_data = @exporter.export(@part_set, default_edge_band_thickness_mm: 1.0)
    rows = export_data[:rows]

    # Find side_left panel: edges are front, top, bottom
    # top and bottom are along width -> deduct 2.0mm from length
    # front is along length -> deduct 1.0mm from width
    side = rows.find { |r| r[:role] == 'side_left' }
    assert side, 'side_left part should be in cut list'

    assert_equal side[:finished_length_mm] - 2.0, side[:cut_length_mm]
    assert_equal side[:finished_width_mm] - 1.0, side[:cut_width_mm]
    assert_equal '1.0mm', side[:edge_front]
    assert_equal '1.0mm', side[:edge_top]
    assert_equal '1.0mm', side[:edge_bottom]
    assert_equal '-', side[:edge_back]
  end

  def test_csv_generation_has_header_and_content
    export_data = @exporter.export(@part_set)
    csv_text = export_data[:csv]

    lines = csv_text.split("\n")
    assert_operator lines.length, :>, 1
    assert_includes lines.first, 'Part ID'
    assert_includes lines.first, 'Cut Length (mm)'
    assert_includes lines.first, 'Finished Length (mm)'
  end

  def test_edge_banding_schedule_aggregates_linear_meters
    export_data = @exporter.export(@part_set)
    schedule = export_data[:edge_banding_schedule]

    assert_operator schedule.length, :>=, 1
    tape = schedule.first
    assert_equal 'Edge Tape 1.0mm', tape[:specification]
    assert_operator tape[:total_length_m], :>, 0.0
    assert_operator tape[:part_count], :>, 0
  end

  def test_hardware_schedule_aggregates_items
    export_data = @exporter.export(@part_set)
    hw = export_data[:hardware_schedule]

    hinges = hw.find { |h| h[:kind] == 'hinge' }
    slides = hw.find { |h| h[:kind] == 'drawer_slide_pair' }

    assert hinges, 'hinges should be present'
    assert_operator hinges[:quantity], :>=, 2
    assert slides, 'drawer slides should be present'
    assert_equal 2, slides[:quantity]
  end
end
