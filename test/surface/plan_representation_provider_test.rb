# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/surface/surface_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/surface/pattern_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/surface/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/surface/plan_representation_provider')

SurfacePlanObject = Struct.new(:id, :type, :entity)

class SurfacePlanSmartObjects
  def initialize(objects = {})
    @objects = objects
  end

  def fetch_by_id(id)
    @objects[id]
  end
end

class SurfacePlanRuntime
  attr_reader :smart_objects

  def initialize(objects = {})
    @smart_objects = SurfacePlanSmartObjects.new(objects)
  end
end

class SurfacePlanRepresentationProviderTest < Minitest::Test
  def setup
    @repository = JiraNot::ConstructFlow::Surface::Repository.new
  end

  def request(lod)
    {
      'view' => 'plan', 'scale' => '1:50', 'phase_view' => 'proposed', 'lod' => lod,
      'context' => { 'style_preset' => "surface.#{lod}" }
    }
  end

  def test_surface_construction_plan_contains_boundary_hole_and_area
    entity = FakeAttributeCarrier.new
    definition = JiraNot::ConstructFlow::Surface::SurfaceDefinition.new(
      outer_boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]],
      holes_mm: [[[1000, 1000, 0], [1500, 1000, 0], [1500, 1500, 0], [1000, 1500, 0]]],
      surface_type: 'paver', base_elevation_mm: 0
    )
    @repository.write_surface(entity, definition)
    object = SurfacePlanObject.new('surface-1', 'surface.boundary', entity)
    provider = JiraNot::ConstructFlow::Surface::PlanRepresentationProvider.new(runtime: SurfacePlanRuntime.new, repository: @repository)

    result = provider.render(object: object, request: request('construction'))

    assert_equal 'surface_boundary', result[:primitives][0]['role']
    assert result[:primitives].any? { |item| item['role'] == 'surface_hole' }
    assert result[:annotations].any? { |item| item['role'] == 'net_area' }
    assert_equal 'surface_paving_plan', result[:metadata]['drawing_family']
  end

  def test_pattern_coordination_plan_contains_direction_origin_and_host_trace
    surface_entity = FakeAttributeCarrier.new
    surface = SurfacePlanObject.new('surface-1', 'surface.boundary', surface_entity)
    @repository.write_surface(
      surface_entity,
      JiraNot::ConstructFlow::Surface::SurfaceDefinition.new(
        outer_boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]],
        surface_type: 'tile'
      )
    )
    pattern_entity = FakeAttributeCarrier.new
    @repository.write_pattern(
      pattern_entity,
      JiraNot::ConstructFlow::Surface::PatternDefinition.new(
        surface_object_id: 'surface-1', pattern: 'running_bond', origin_mm: [100, 200, 0],
        angle_deg: 45, module_mm: [300, 600], joint_mm: 3, minimum_cut_mm: 60, layout_state: 'locked'
      )
    )
    pattern = SurfacePlanObject.new('pattern-1', 'surface.pattern', pattern_entity)
    provider = JiraNot::ConstructFlow::Surface::PlanRepresentationProvider.new(
      runtime: SurfacePlanRuntime.new('surface-1' => surface), repository: @repository
    )

    result = provider.render(object: pattern, request: request('coordination'))

    assert result[:primitives].any? { |item| item['role'] == 'pattern_direction' }
    assert result[:primitives].any? { |item| item['role'] == 'pattern_origin' }
    assert result[:annotations].any? { |item| item['role'] == 'surface_host' }
    assert result[:annotations].any? { |item| item['role'] == 'minimum_cut' }
  end
end
