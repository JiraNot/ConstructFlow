# frozen_string_literal: true

require_relative '../test_helper'

class DrawingAutomationTest < Minitest::Test
  Core = JiraNot::ConstructFlow::Core

  def setup
    @levels = [
      { 'id' => 'lvl_01', 'name' => 'Level 1', 'elevation_mm' => 0.0 },
      { 'id' => 'lvl_02', 'name' => 'Level 2', 'elevation_mm' => 3200.0 }
    ]

    @wall1 = {
      id: 'w1',
      start_point_mm: [0.0, 0.0, 0.0],
      end_point_mm: [5000.0, 0.0, 0.0],
      height_mm: 2800.0,
      thickness_mm: 150.0,
      material: 'masonry'
    }

    @wall2 = {
      id: 'w2',
      start_point_mm: [5000.0, 0.0, 0.0],
      end_point_mm: [5000.0, 4000.0, 0.0],
      height_mm: 2800.0,
      thickness_mm: 150.0,
      material: 'masonry'
    }

    @door = {
      id: 'd1',
      category: 'door',
      location_mm: [2000.0, 0.0, 0.0],
      width_mm: 900.0,
      height_mm: 2000.0,
      sill_height_mm: 0.0
    }
  end

  def test_drawing_intent_registry_plans_standard_packages
    registry = Core::DrawingIntentRegistry.new
    sheets = registry.plan_package(
      package_scopes: %w[architecture structure],
      levels: @levels,
      revision: 'P01'
    )

    refute_empty sheets
    sheet_numbers = sheets.map(&:number)

    # Architecture per-level should produce A-101 (Level 1) and A-102 (Level 2)
    assert_includes sheet_numbers, 'A-101'
    assert_includes sheet_numbers, 'A-102'
    assert_includes sheet_numbers, 'A-201' # Elevations
    assert_includes sheet_numbers, 'A-301' # Sections
    assert_includes sheet_numbers, 'S-101' # Structure foundation

    # All generated sheets are valid DrawingSheetSpec objects
    assert sheets.all? { |s| s.is_a?(Core::DrawingSheetSpec) }
    assert_equal 'P01', sheets.first.revision
  end

  def test_elevation_generator_projects_walls_and_openings
    gen = Core::ElevationGenerator.new
    elev = gen.generate(
      walls: [@wall1, @wall2],
      openings: [@door],
      levels: @levels,
      direction: 'north'
    )

    assert_equal 'North Elevation', elev.title
    assert_equal 'north', elev.direction
    assert_operator elev.bounds_2d[2], :>=, 5000.0 # U_max should span 5000mm wall

    # Wall 1 runs along X, so in North elevation (viewing towards -Y) it is fully visible
    w1_elem = elev.wall_elements.find { |w| w[:wall_id] == 'w1' }
    assert w1_elem
    assert_equal 0.0, w1_elem[:u_start]
    assert_equal 5000.0, w1_elem[:u_end]
    assert_equal 2800.0, w1_elem[:z_top]

    # Door opening projection
    door_elem = elev.opening_elements.find { |o| o[:opening_id] == 'd1' }
    assert door_elem
    assert_equal 1550.0, door_elem[:u_min] # 2000 - 450
    assert_equal 2450.0, door_elem[:u_max] # 2000 + 450
    assert_equal 2000.0, door_elem[:z_top]

    # Level datums
    assert_equal 2, elev.level_datums.length
    assert_equal 'Level 1', elev.level_datums.first[:name]
  end

  def test_section_generator_cuts_walls_and_produces_cross_sections
    gen = Core::SectionGenerator.new

    # Cutting line passing through wall 1 at X=2500, from Y=-1000 to Y=1000
    cut_line = {
      start_point_mm: [2500.0, -1000.0, 0.0],
      end_point_mm: [2500.0, 1000.0, 0.0]
    }

    section = gen.generate(
      cut_line: cut_line,
      walls: [@wall1, @wall2],
      slabs: [{ thickness_mm: 150.0, elevation_mm: 0.0 }],
      levels: @levels,
      title: 'Section A-A'
    )

    assert_equal 'Section A-A', section.title
    assert_equal 2000.0, section.station_length

    # Wall 1 must be intersected (cut)
    wall_cut = section.cut_elements.find { |e| e[:type] == 'wall_cut' && e[:wall_id] == 'w1' }
    assert wall_cut, 'Wall 1 should be cut by section plane'
    assert_equal 1000.0, wall_cut[:station_center] # Intersection at station 1000mm
    assert_equal 2800.0, wall_cut[:z_top]
    assert_equal 'masonry_cross', wall_cut[:hatch_pattern]

    # Slab cut
    slab_cut = section.cut_elements.find { |e| e[:type] == 'slab_cut' }
    assert slab_cut
    assert_equal(-150.0, slab_cut[:z_base])
    assert_equal 0.0, slab_cut[:z_top]
  end

  def test_detail_callout_definition_validation_and_tags
    callout = Core::DetailCalloutDefinition.new(
      id: 'det_01',
      detail_number: '2',
      sheet_number: 'A-501',
      source_sheet_number: 'A-101',
      title: 'Parapet Flash Detail',
      scale: '1:5',
      location_mm: [1500.0, 2000.0, 3200.0]
    )

    assert callout.valid?
    assert_empty callout.errors
    assert_equal '2/A-501', callout.callout_tag

    hash = callout.to_h
    restored = Core::DetailCalloutDefinition.from_h(hash)
    assert_equal callout.id, restored.id
    assert_equal callout.callout_tag, restored.callout_tag
  end

  def test_door_window_schedule_generator_groups_and_exports_csv
    type_d1 = JiraNot::ConstructFlow::DoorWindow::DoorWindowType.new(
      id: 'D01',
      name: 'D1 Main Door',
      category: 'door',
      operation: 'swing',
      width_mm: 900.0,
      height_mm: 2100.0,
      frame_material: 'wood',
      frame_width_mm: 50.0,
      panel_style: 'solid'
    )

    type_w1 = JiraNot::ConstructFlow::DoorWindow::DoorWindowType.new(
      id: 'W01',
      name: 'W1 Sliding Window',
      category: 'window',
      operation: 'sliding',
      width_mm: 1500.0,
      height_mm: 1200.0,
      frame_material: 'aluminium',
      frame_width_mm: 45.0,
      panel_style: 'glazed'
    )

    instances = [
      { id: 'inst_d1', type_id: 'D01' },
      { id: 'inst_d2', type_id: 'D01' },
      { id: 'inst_w1', type_id: 'W01' }
    ]

    gen = Core::DoorWindowScheduleGenerator.new
    schedule = gen.generate(
      instances: instances,
      types: { 'D01' => type_d1, 'W01' => type_w1 }
    )

    assert_equal 2, schedule[:total_types]
    assert_equal 3, schedule[:total_instances]
    assert_equal 1, schedule[:doors].length
    assert_equal 1, schedule[:windows].length

    door_entry = schedule[:doors].first
    assert_equal 2, door_entry.quantity
    assert_equal 800.0, door_entry.clear_width_mm # 900 - 2*50
    assert_equal 2000.0, door_entry.clear_height_mm # 2100 - 2*50

    assert_includes schedule[:csv], 'Mark,Category,Type Name,Operation'
    assert_includes schedule[:csv], 'D1 Main Door'
    assert_includes schedule[:csv], 'W1 Sliding Window'
  end

  def test_joinery_shop_drawing_generator_creates_views_and_dimensions
    cabinet_run = {
      id: 'kitchen_base_01',
      total_width_mm: 2400.0,
      height_mm: 850.0,
      depth_mm: 600.0,
      toe_kick_height_mm: 100.0,
      countertop_thickness_mm: 30.0,
      modules: [
        { width_mm: 600.0, type: 'door' },
        { width_mm: 1200.0, type: 'drawers' },
        { width_mm: 600.0, type: 'door' }
      ]
    }

    gen = Core::JoineryShopDrawingGenerator.new
    shop_dwg = gen.generate(cabinet_run: cabinet_run)

    assert_equal 'Shop Drawing - kitchen_base_01', shop_dwg.title
    assert_equal [2400.0, 600.0, 850.0], shop_dwg.overall_dimensions_mm

    # Front elevation elements
    refute_empty shop_dwg.front_elevation
    toe_kick = shop_dwg.front_elevation.find { |e| e[:type] == 'toe_kick' }
    assert toe_kick
    assert_equal 2400.0, toe_kick[:width]

    counter = shop_dwg.front_elevation.find { |e| e[:type] == 'countertop' }
    assert counter
    assert_equal 2440.0, counter[:width]

    # Drawers
    drawers = shop_dwg.front_elevation.select { |e| e[:type] == 'drawer_front' }
    assert_equal 3, drawers.length

    # Side section
    assert_equal 600.0, shop_dwg.side_section[:depth_mm]
    assert_equal 850.0, shop_dwg.side_section[:total_height_mm]

    # Top plan
    assert_equal 2400.0, shop_dwg.top_plan[:width_mm]
  end
end
