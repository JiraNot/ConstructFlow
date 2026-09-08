# frozen_string_literal: true

require_relative '../test_helper'

class StructureDomainTest < Minitest::Test
  SmartObjectStub = Struct.new(
    :id, :entity, :owner_module, :type, :created_phase, :removed_phase, :source_state,
    keyword_init: true
  )

  def column_definition
    JiraNot::ConstructFlow::Structure::ColumnDefinition.new(
      location_mm: [1000, 2000, 0],
      section_mm: [200, 300],
      base_level_id: 'FFL',
      top_level_id: 'ROOF',
      base_elevation_mm: 0,
      top_elevation_mm: 3000,
      engineering_status: 'preliminary'
    )
  end

  def test_column_persists_semantic_levels_and_geometry_basis
    definition = column_definition
    assert definition.valid?
    assert_in_delta 3000.0, definition.height_mm, 0.001
    assert_in_delta 180_000_000.0, definition.volume_mm3, 0.001
    assert_equal 'FFL', definition.base_level_id
    assert_equal 'ROOF', definition.top_level_id

    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Structure::Repository.new
    repository.write_column(entity, definition)
    restored = repository.read_column(entity)
    assert_equal definition.to_h, restored.to_h
  end

  def test_coordination_capability_exposes_conservative_bounds
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Structure::Repository.new
    repository.write_column(entity, column_definition)
    object = SmartObjectStub.new(
      id: 'cf_column_1', entity: entity,
      owner_module: 'constructflow.structure', type: 'structure.column'
    )
    capability = JiraNot::ConstructFlow::Structure::CoordinationCapability.new(repository: repository)

    box = capability.bounding_box_mm(object)
    assert_equal [900.0, 1850.0, 0.0], box[:min]
    assert_equal [1100.0, 2150.0, 3000.0], box[:max]
    assert capability.intersects_box?(object, min: [1000, 1900, -100], max: [1200, 2200, 100])
    refute capability.intersects_box?(object, min: [5000, 5000, 0], max: [6000, 6000, 1000])
  end

  def test_foundation_volume_formwork_and_support_reference
    definition = JiraNot::ConstructFlow::Structure::FoundationDefinition.new(
      center_mm: [1000, 2000, 0],
      size_mm: [1000, 1200, 350],
      top_elevation_mm: 0,
      foundation_type: 'spread_footing',
      supported_object_id: 'cf_column_1'
    )

    assert definition.valid?
    assert_in_delta(-350.0, definition.bottom_elevation_mm, 0.001)
    assert_in_delta 420_000_000.0, definition.volume_mm3, 0.001
    assert_in_delta 1_540_000.0, definition.formwork_area_mm2, 0.001
    assert_equal 'cf_column_1', definition.supported_object_id
  end

  def test_rebar_set_generates_bbs_and_mass_without_physical_bars
    definition = JiraNot::ConstructFlow::Structure::RebarSetDefinition.new(
      host_object_id: 'cf_footing_1',
      diameter_mm: 12,
      bar_count: 10,
      length_each_mm: 1200,
      bar_grade: 'SD40',
      role: 'main_bottom',
      cover_mm: 50
    )

    assert definition.valid?
    assert_in_delta 12_000.0, definition.total_length_mm, 0.001
    assert_operator definition.total_mass_kg, :>, 10.0
    assert_operator definition.total_mass_kg, :<, 12.0

    row = definition.bbs_row
    assert_equal 10, row[:bar_count]
    assert_in_delta 12.0, row[:total_length_m], 0.001
    assert_equal 'preliminary', row[:engineering_status]
  end

  def test_structure_quantities_are_traceable_and_phase_aware
    object = SmartObjectStub.new(
      id: 'cf_column_1',
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil,
      source_state: 'confirmed'
    )
    items = JiraNot::ConstructFlow::Structure::Quantity::StructureQuantityProvider.new
            .column_quantities(smart_object: object, definition: column_definition)

    concrete = items.find { |item| item[:classification] == 'structure.column.concrete' }
    formwork = items.find { |item| item[:classification] == 'structure.column.formwork' }
    assert_equal 'cf_column_1', concrete[:source_object_id]
    assert_equal 'constructflow.structure', concrete[:source_module]
    assert_equal 'm3', concrete[:unit]
    assert_in_delta 0.18, concrete[:value], 0.001
    assert_equal 'm2', formwork[:unit]
    assert_equal JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION, concrete[:phase_scope]
  end

  def test_preliminary_status_is_explicit_validation_information
    issues = JiraNot::ConstructFlow::Structure::Validators::StructureValidator.new
             .validate_column(column_definition)
    notice = issues.find { |item| item[:rule_id] == 'structure.engineering_status.preliminary' }

    refute_nil notice
    assert_equal 'info', notice[:severity]
    assert_match(/not engineering approval/, notice[:message])
  end
end
