# frozen_string_literal: true

require_relative 'test_helper'

INTERIOR_TEST_ROOT = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'interior')
require File.join(INTERIOR_TEST_ROOT, 'cabinet_run_definition')
require File.join(INTERIOR_TEST_ROOT, 'joinery_part_set_definition')
require File.join(INTERIOR_TEST_ROOT, 'joinery_part_generator')
require File.join(INTERIOR_TEST_ROOT, 'repository')
require File.join(INTERIOR_TEST_ROOT, 'validators', 'interior_validator')
require File.join(INTERIOR_TEST_ROOT, 'quantity', 'interior_quantity_provider')

class InteriorJoineryTest < Minitest::Test
  Interior = JiraNot::ConstructFlow::Interior

  def setup
    @definition = Interior::CabinetRunDefinition.new(
      origin_mm: [0, 0, 0],
      width_mm: 1800,
      height_mm: 800,
      depth_mm: 600,
      board_thickness_mm: 18,
      back_thickness_mm: 9,
      toe_kick_mm: 100,
      carcass_material_id: 'board.hmr.18'
    )
  end

  def test_equal_split_preserves_overall_width
    split = @definition.split_equal(count: 3)

    assert_equal 3, split.modules.length
    assert_equal %w[M01 M02 M03], split.module_ids
    assert_in_delta 600.0, split.modules.first['width_mm'], 0.001
    assert_in_delta split.usable_width_mm, split.module_width_sum_mm, 0.001
    assert split.valid?, split.errors.join(', ')
  end

  def test_explicit_split_requires_exact_usable_width
    split = @definition.split_explicit(widths_mm: [450, 750, 600])

    assert_equal [450.0, 750.0, 600.0], split.modules.map { |mod| mod['width_mm'] }
    assert_raises(ArgumentError) { @definition.split_explicit(widths_mm: [450, 700, 600]) }
  end

  def test_mixed_fronts_and_drawers_share_one_cabinet_identity_model
    definition = @definition.split_equal(count: 3)
                            .assign_front(module_id: 'M01', front_type: 'single_swing', style: 'shaker')
                            .assign_front(module_id: 'M02', front_type: 'glass', style: 'glass', material_id: 'glass.clear.6')
                            .assign_front(module_id: 'M03', front_type: 'open', style: 'flat')
                            .add_drawer_set(module_id: 'M03', count: 3, slide_type: 'soft_close')

    assert_equal 'single_swing', definition.front_for('M01')['front_type']
    assert_equal 'glass', definition.front_for('M02')['front_type']
    assert_equal 'open', definition.front_for('M03')['front_type']
    assert_equal 3, definition.drawer_set_for('M03')['count']
    assert definition.valid?, definition.errors.join(', ')
  end

  def test_hinge_rule_varies_with_front_height
    generator = Interior::JoineryPartGenerator.new

    assert_equal 2, generator.hinge_count_for_height(800)
    assert_equal 3, generator.hinge_count_for_height(1200)
    assert_equal 4, generator.hinge_count_for_height(2000)
  end

  def test_generate_parts_produces_traceable_carcass_front_and_hardware
    definition = @definition.split_equal(count: 3)
                            .assign_front(module_id: 'M01', front_type: 'single_swing', style: 'flat')
                            .assign_front(module_id: 'M02', front_type: 'double_swing', style: 'shaker')
                            .add_drawer_set(module_id: 'M03', count: 3, slide_type: 'soft_close')
    parts = Interior::JoineryPartGenerator.new.generate(
      cabinet_object_id: 'cfobj-cabinet-01',
      definition: definition
    )

    assert parts.valid?, parts.errors.join(', ')
    assert parts.parts.all? { |part| part['id'].start_with?('cfobj-cabinet-01-P') }
    assert parts.parts.any? { |part| part['role'] == 'side_left' }
    assert parts.parts.any? { |part| part['role'] == 'partition_01' }
    assert parts.parts.any? { |part| part['role'] == 'front_leaf_1' }
    assert parts.parts.any? { |part| part['role'] == 'drawer_face_01' }
    assert_equal 6, parts.hardware_count('hinge')
    assert_equal 3, parts.hardware_count('drawer_slide_pair')
    assert_operator parts.board_area_mm2, :>, 0
    assert_operator parts.edge_band_length_mm, :>, 0
  end

  def test_glass_front_is_separated_from_board_area
    definition = @definition.assign_front(
      module_id: 'M01', front_type: 'glass', style: 'glass', material_id: 'glass.clear.6'
    )
    parts = Interior::JoineryPartGenerator.new.generate(
      cabinet_object_id: 'cfobj-glass',
      definition: definition
    )

    assert_equal 1, parts.glass_parts.length
    assert_operator parts.glass_area_mm2, :>, 0
    assert parts.board_parts.none? { |part| part['material_class'] == 'glass' }
  end

  def test_repository_round_trip_preserves_design_and_fabrication_data
    entity = FakeEntity.new
    repository = Interior::Repository.new
    definition = @definition.split_equal(count: 2).assign_front(
      module_id: 'M01', front_type: 'single_swing', style: 'flat'
    )
    parts = Interior::JoineryPartGenerator.new.generate(cabinet_object_id: 'cab-1', definition: definition)

    repository.write_cabinet_run(entity, definition)
    repository.write_part_set(entity, parts)

    assert_equal definition.to_h, repository.read_cabinet_run(entity).to_h
    assert_equal parts.to_h, repository.read_part_set(entity).to_h
    repository.clear_part_set(entity)
    assert_nil repository.read_part_set(entity)
  end

  def test_validator_warns_for_tiny_filler_without_rejecting_valid_cabinet
    definition = Interior::CabinetRunDefinition.new(
      origin_mm: [0, 0, 0], width_mm: 1000, height_mm: 800, depth_mm: 600,
      left_filler_mm: 10
    )
    issues = Interior::Validators::InteriorValidator.new.validate_cabinet(definition)

    assert issues.any? { |issue| issue[:rule_id] == 'interior.cabinet.left_filler_small' }
    refute issues.any? { |issue| issue[:severity] == 'error' }
  end

  def test_part_quantity_is_traceable_to_cabinet_object
    definition = @definition.split_equal(count: 2)
                            .assign_front(module_id: 'M01', front_type: 'single_swing')
                            .add_drawer_set(module_id: 'M02', count: 2)
    parts = Interior::JoineryPartGenerator.new.generate(cabinet_object_id: 'cab-q', definition: definition)
    smart_object = Struct.new(:id, :removed_phase, :created_phase, :source_state).new(
      'cab-q', nil, JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION, 'confirmed'
    )
    items = Interior::Quantity::InteriorQuantityProvider.new.part_set_quantities(
      smart_object: smart_object, definition: parts
    )

    assert items.all? { |item| item[:source_object_id] == 'cab-q' }
    assert items.any? { |item| item[:classification] == 'interior.joinery.board_area' }
    assert items.any? { |item| item[:classification] == 'interior.joinery.edge_band' }
    assert items.any? { |item| item[:classification] == 'interior.hardware.hinge' }
    assert items.any? { |item| item[:classification] == 'interior.hardware.drawer_slide_pair' }
  end

  def test_editing_design_can_invalidate_generated_part_set
    entity = FakeEntity.new
    repository = Interior::Repository.new
    parts = Interior::JoineryPartGenerator.new.generate(cabinet_object_id: 'cab-dirty', definition: @definition)
    repository.write_part_set(entity, parts)

    repository.clear_part_set(entity)
    assert_nil repository.read_part_set(entity)
  end
end
