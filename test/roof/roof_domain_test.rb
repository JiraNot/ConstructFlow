# frozen_string_literal: true

require_relative '../test_helper'

class RoofDomainTest < Minitest::Test
  SmartObjectStub = Struct.new(:id, :entity, :owner_module, :type, :created_phase, :removed_phase, :source_state, keyword_init: true)

  def roof_definition
    JiraNot::ConstructFlow::Roof::RoofDefinition.new(
      boundary_mm: [[0, 0, 3000], [4000, 0, 3000], [4000, 3000, 3000], [0, 3000, 3000]],
      roof_form: 'lean_to',
      slope_percent: 10,
      slope_direction_xy: [0, 1],
      low_elevation_mm: 3000,
      covering_system: 'metal_sheet'
    )
  end

  def test_lean_to_roof_generates_controlled_sloped_points
    definition = roof_definition
    assert definition.valid?
    points = definition.sloped_points_mm

    assert_in_delta 3000.0, points[0][2], 0.001
    assert_in_delta 3300.0, points[2][2], 0.001
    assert_in_delta 12_000_000.0, definition.plan_area_mm2, 0.001
    assert_operator definition.roof_area_mm2, :>, definition.plan_area_mm2
  end

  def test_covering_minimum_slope_is_warning_not_hidden_geometry_change
    definition = roof_definition.with(slope_percent: 2, covering_system: 'polycarbonate')
    issues = JiraNot::ConstructFlow::Roof::Validators::RoofValidator.new.validate_roof(definition)
    issue = issues.find { |item| item[:rule_id] == 'roof.minimum_slope' }

    refute_nil issue
    assert_equal 'warning', issue[:severity]
    assert_in_delta 2.0, definition.slope_percent, 0.001
  end

  def test_repository_and_edge_capability_round_trip
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Roof::Repository.new
    repository.write_roof(entity, roof_definition)
    object = SmartObjectStub.new(
      id: 'cf_roof_1', entity: entity,
      owner_module: 'constructflow.roof', type: 'roof.system'
    )
    capability = JiraNot::ConstructFlow::Roof::EdgeHostCapability.new(repository: repository)

    assert capability.compatible?(object)
    assert_equal roof_definition.to_h, repository.read_roof(entity).to_h
    assert_in_delta 4000.0, capability.edge_length_mm(object, 0), 0.001
    midpoint = capability.point_on_edge_mm(object, 0, 0.5)
    assert_in_delta 2000.0, midpoint[0], 0.001
  end

  def test_gutter_definition_persists_without_owning_roof
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Roof::Repository.new
    definition = JiraNot::ConstructFlow::Roof::GutterDefinition.new(
      roof_object_id: 'cf_roof_1',
      edge_index: 1,
      profile_id: 'box.150',
      outlet_ratio: 0.75,
      outlet_connector_id: 'conn_out'
    )
    repository.write_gutter(entity, definition)

    restored = repository.read_gutter(entity)
    assert_equal definition.to_h, restored.to_h
    assert_equal 'cf_roof_1', restored.roof_object_id
    assert_equal 'conn_out', restored.outlet_connector_id
  end

  def test_roof_quantity_is_traceable
    object = SmartObjectStub.new(
      id: 'cf_roof_1',
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil,
      source_state: 'confirmed'
    )
    item = JiraNot::ConstructFlow::Roof::Quantity::RoofQuantityProvider.new
           .roof_quantities(smart_object: object, definition: roof_definition)
           .find { |entry| entry[:measure] == 'area' }

    assert_equal 'cf_roof_1', item[:source_object_id]
    assert_equal 'constructflow.roof', item[:source_module]
    assert_equal 'm2', item[:unit]
    assert_operator item[:value], :>, 12.0
  end
end
