# frozen_string_literal: true

require_relative '../../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/structure/column_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/structure/foundation_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/structure/rebar_set_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/structure/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/structure/plan_representation_provider')

StructurePlanObject = Struct.new(:id, :type, :entity)

class StructurePlanSmartObjects
  def initialize(objects = {})
    @objects = objects
  end

  def fetch_by_id(id)
    @objects[id]
  end
end

class StructurePlanRuntime
  attr_reader :smart_objects

  def initialize(objects = {})
    @smart_objects = StructurePlanSmartObjects.new(objects)
  end
end

class StructurePlanRepresentationProviderTest < Minitest::Test
  def setup
    @repository = JiraNot::ConstructFlow::Structure::Repository.new
  end

  def request(lod)
    {
      'view' => 'plan', 'scale' => '1:50', 'phase_view' => 'proposed', 'lod' => lod,
      'context' => { 'style_preset' => "structure.#{lod}" }
    }
  end

  def test_column_simple_and_coordination_profiles_share_same_semantic_object
    entity = FakeAttributeCarrier.new
    definition = JiraNot::ConstructFlow::Structure::ColumnDefinition.new(
      location_mm: [1000, 2000, 0], section_mm: [300, 400],
      base_level_id: 'L1', top_level_id: 'L2', base_elevation_mm: 0, top_elevation_mm: 3000,
      engineering_status: 'preliminary'
    )
    @repository.write_column(entity, definition)
    object = StructurePlanObject.new('col-1', 'structure.column', entity)
    provider = JiraNot::ConstructFlow::Structure::PlanRepresentationProvider.new(runtime: StructurePlanRuntime.new, repository: @repository)

    simple = provider.render(object: object, request: request('simple'))
    coordination = provider.render(object: object, request: request('coordination'))

    assert_equal 'column_outline', simple[:primitives][0]['role']
    assert_equal [850.0, 1800.0, 0.0], simple[:primitives][0]['points_mm'][0]
    refute simple[:annotations].any? { |item| item['role'] == 'section_size' }
    assert coordination[:annotations].any? { |item| item['role'] == 'section_size' && item['text'] == '300x400' }
    status = coordination[:annotations].find { |item| item['role'] == 'engineering_status' }
    assert_equal 'verify', status['status']
    assert_equal 'structure_plan', coordination[:metadata]['drawing_family']
  end

  def test_foundation_construction_plan_contains_size_and_top_level
    entity = FakeAttributeCarrier.new
    definition = JiraNot::ConstructFlow::Structure::FoundationDefinition.new(
      center_mm: [500, 600, -100], size_mm: [1000, 1200, 350], top_elevation_mm: -100,
      foundation_type: 'spread_footing', supported_object_id: 'col-1', engineering_status: 'engineer_approved'
    )
    @repository.write_foundation(entity, definition)
    object = StructurePlanObject.new('f-1', 'structure.foundation', entity)
    provider = JiraNot::ConstructFlow::Structure::PlanRepresentationProvider.new(runtime: StructurePlanRuntime.new, repository: @repository)

    result = provider.render(object: object, request: request('construction'))

    assert_equal 'foundation_outline', result[:primitives][0]['role']
    assert result[:annotations].any? { |item| item['role'] == 'foundation_size' && item['text'] == '1000x1200x350' }
    assert result[:annotations].any? { |item| item['role'] == 'top_level' && item['text'] == 'TOS -100' }
  end

  def test_rebar_plan_tag_is_anchored_to_host_and_expands_by_lod
    host_entity = FakeAttributeCarrier.new
    @repository.write_column(
      host_entity,
      JiraNot::ConstructFlow::Structure::ColumnDefinition.new(
        location_mm: [1200, 2200, 0], section_mm: [300, 300], base_elevation_mm: 0, top_elevation_mm: 3000
      )
    )
    host = StructurePlanObject.new('col-1', 'structure.column', host_entity)

    rebar_entity = FakeAttributeCarrier.new
    @repository.write_rebar_set(
      rebar_entity,
      JiraNot::ConstructFlow::Structure::RebarSetDefinition.new(
        host_object_id: 'col-1', diameter_mm: 16, bar_count: 8, length_each_mm: 2800,
        role: 'main_bottom', bar_grade: 'SD40', engineering_status: 'preliminary'
      )
    )
    rebar = StructurePlanObject.new('rb-1', 'structure.rebar_set', rebar_entity)
    provider = JiraNot::ConstructFlow::Structure::PlanRepresentationProvider.new(
      runtime: StructurePlanRuntime.new('col-1' => host), repository: @repository
    )

    result = provider.render(object: rebar, request: request('coordination'))

    tag = result[:annotations].find { |item| item['role'] == 'rebar_tag' }
    assert_equal '8-DB16', tag['text']
    assert_equal [1200.0, 2200.0, 0.0], tag['anchor_mm']
    assert result[:annotations].any? { |item| item['role'] == 'host_object' && item['text'] == 'HOST col-1' }
  end
end
