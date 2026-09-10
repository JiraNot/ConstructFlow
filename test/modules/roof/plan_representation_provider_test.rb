# frozen_string_literal: true

require_relative '../../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/roof_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/gutter_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/plan_representation_provider')

RoofPlanObject = Struct.new(:id, :type, :entity)

class RoofPlanSmartObjects
  def initialize(objects = {})
    @objects = objects
  end

  def fetch_by_id(id)
    @objects[id]
  end
end

class RoofPlanRuntime
  attr_reader :smart_objects

  def initialize(objects = {})
    @smart_objects = RoofPlanSmartObjects.new(objects)
  end
end

class RoofPlanRepresentationProviderTest < Minitest::Test
  def setup
    @repository = JiraNot::ConstructFlow::Roof::Repository.new
  end

  def request(lod)
    {
      'view' => 'plan', 'scale' => '1:50', 'phase_view' => 'proposed', 'lod' => lod,
      'context' => { 'style_preset' => "roof.#{lod}" }
    }
  end

  def roof_definition
    JiraNot::ConstructFlow::Roof::RoofDefinition.new(
      boundary_mm: [[0, 0, 3000], [4000, 0, 3000], [4000, 3000, 3000], [0, 3000, 3000]],
      roof_form: 'lean_to', slope_percent: 5, slope_direction_xy: [0, 1], low_elevation_mm: 3000,
      covering_system: 'metal_sheet', thickness_mm: 20, generated_from_id: 'extension-1'
    )
  end

  def test_roof_construction_plan_contains_boundary_slope_and_covering
    entity = FakeAttributeCarrier.new
    @repository.write_roof(entity, roof_definition)
    object = RoofPlanObject.new('roof-1', 'roof.system', entity)
    provider = JiraNot::ConstructFlow::Roof::PlanRepresentationProvider.new(runtime: RoofPlanRuntime.new, repository: @repository)

    result = provider.render(object: object, request: request('construction'))

    assert_equal 'roof_boundary', result[:primitives][0]['role']
    assert result[:primitives].any? { |item| item['role'] == 'roof_slope_direction' }
    assert result[:annotations].any? { |item| item['role'] == 'roof_slope' && item['text'] == 'S=5%' }
    assert result[:annotations].any? { |item| item['role'] == 'covering_system' && item['text'] == 'METAL_SHEET' }
    assert_equal 'roof_plan', result[:metadata]['drawing_family']
  end

  def test_roof_coordination_adds_low_level_and_generation_trace
    entity = FakeAttributeCarrier.new
    @repository.write_roof(entity, roof_definition)
    object = RoofPlanObject.new('roof-1', 'roof.system', entity)
    provider = JiraNot::ConstructFlow::Roof::PlanRepresentationProvider.new(runtime: RoofPlanRuntime.new, repository: @repository)

    result = provider.render(object: object, request: request('coordination'))

    assert result[:annotations].any? { |item| item['role'] == 'low_elevation' && item['text'] == 'LOW 3000' }
    assert result[:annotations].any? { |item| item['role'] == 'generated_from' && item['text'] == 'FROM extension-1' }
  end

  def test_gutter_plan_uses_host_roof_edge_and_outlet_ratio
    roof_entity = FakeAttributeCarrier.new
    @repository.write_roof(roof_entity, roof_definition)
    roof = RoofPlanObject.new('roof-1', 'roof.system', roof_entity)

    gutter_entity = FakeAttributeCarrier.new
    @repository.write_gutter(
      gutter_entity,
      JiraNot::ConstructFlow::Roof::GutterDefinition.new(
        roof_object_id: 'roof-1', edge_index: 0, profile_id: 'box.150', outlet_ratio: 0.5, outlet_connector_id: 'rw-out-1'
      )
    )
    gutter = RoofPlanObject.new('gutter-1', 'roof.gutter', gutter_entity)
    provider = JiraNot::ConstructFlow::Roof::PlanRepresentationProvider.new(
      runtime: RoofPlanRuntime.new('roof-1' => roof), repository: @repository
    )

    result = provider.render(object: gutter, request: request('coordination'))

    assert_equal [[0.0, 0.0, 3000.0], [4000.0, 0.0, 3000.0]], result[:primitives][0]['points_mm']
    outlet = result[:primitives].find { |item| item['role'] == 'gutter_outlet' }
    assert_equal [2000.0, 0.0, 3000.0], outlet['position_mm']
    assert result[:annotations].any? { |item| item['role'] == 'outlet_connector' && item['text'] == 'OUT rw-out-1' }
  end
end
