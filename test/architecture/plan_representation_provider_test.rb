# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/architecture/wall_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/architecture/wall_repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/architecture/plan_representation_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/opening/opening_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/opening/opening_repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/opening/plan_representation_provider')

ArchitecturePlanObject = Struct.new(:id, :type, :entity, :owner_module)

class ArchitecturePlanSmartObjects
  def initialize(objects = {})
    @objects = objects
  end

  def fetch_by_id(id)
    @objects[id]
  end
end

class ArchitecturePlanRuntime
  attr_reader :smart_objects

  def initialize(objects = {})
    @smart_objects = ArchitecturePlanSmartObjects.new(objects)
  end
end

class ArchitecturePlanRepresentationProviderTest < Minitest::Test
  def request(lod)
    {
      'view' => 'plan', 'scale' => '1:50', 'phase_view' => 'proposed', 'lod' => lod,
      'context' => { 'style_preset' => "architecture.#{lod}" }
    }
  end

  def wall_definition
    JiraNot::ConstructFlow::Architecture::WallDefinition.new(
      path_mm: [[0, 0, 0], [4000, 0, 0]], thickness_mm: 150, height_mm: 2800,
      wall_type_id: 'wall.masonry.150', geometry_mode: 'parametric'
    )
  end

  def test_wall_construction_plan_contains_centerline_faces_and_type
    entity = FakeAttributeCarrier.new
    repository = JiraNot::ConstructFlow::Architecture::WallRepository.new
    repository.write(entity, wall_definition)
    object = ArchitecturePlanObject.new('wall-1', 'architecture.wall', entity, 'constructflow.architecture')
    provider = JiraNot::ConstructFlow::Architecture::PlanRepresentationProvider.new(repository: repository)

    result = provider.render(object: object, request: request('construction'))

    assert result[:primitives].any? { |item| item['role'] == 'wall_centerline' }
    assert_equal 2, result[:primitives].count { |item| item['role'] == 'wall_face' }
    assert result[:annotations].any? { |item| item['role'] == 'wall_type' }
    assert result[:annotations].any? { |item| item['role'] == 'wall_thickness' }
  end

  def test_opening_coordination_plan_resolves_semantic_wall_location_and_infill
    wall_entity = FakeAttributeCarrier.new
    wall_repository = JiraNot::ConstructFlow::Architecture::WallRepository.new
    wall_repository.write(wall_entity, wall_definition)
    wall = ArchitecturePlanObject.new('wall-1', 'architecture.wall', wall_entity, 'constructflow.architecture')

    opening_entity = FakeAttributeCarrier.new
    opening_repository = JiraNot::ConstructFlow::Opening::OpeningRepository.new
    opening_repository.write(
      opening_entity,
      JiraNot::ConstructFlow::Opening::OpeningDefinition.new(
        host_object_id: 'wall-1', segment_index: 0, start_offset_mm: 1000,
        width_mm: 900, height_mm: 2100, sill_mm: 0
      )
    )
    opening_repository.write_infill_ref(opening_entity, 'infill_id' => 'door-1', 'infill_type' => 'door_window')
    opening = ArchitecturePlanObject.new('opening-1', 'opening.rectangular', opening_entity, 'constructflow.opening')
    provider = JiraNot::ConstructFlow::Opening::PlanRepresentationProvider.new(
      runtime: ArchitecturePlanRuntime.new('wall-1' => wall),
      repository: opening_repository,
      wall_repository: wall_repository
    )

    result = provider.render(object: opening, request: request('coordination'))

    span = result[:primitives].find { |item| item['role'] == 'opening_span' }
    assert_equal [1000.0, 0.0, 0.0], span['points_mm'][0]
    assert_equal [1900.0, 0.0, 0.0], span['points_mm'][1]
    assert result[:annotations].any? { |item| item['role'] == 'host_wall' }
    assert result[:annotations].any? { |item| item['role'] == 'infill' }
    assert_equal 'architecture_plan', result[:metadata]['drawing_family']
  end
end
