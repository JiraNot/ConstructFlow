# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'roof', 'roof_definition')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'roof', 'repository')

class PlanReferenceCollectorTest < Minitest::Test
  Collector = JiraNot::ConstructFlow::Architecture::PlanReferenceCollector
  Wall = JiraNot::ConstructFlow::Architecture::WallDefinition
  Floor = JiraNot::ConstructFlow::Architecture::FloorDefinition

  ObjectStub = Struct.new(:id, :type, :entity)
  LevelObjectStub = Struct.new(:id, :type, :entity, :level_refs)
  RuntimeStub = Struct.new(:smart_objects)
  DiagnosticsStub = Struct.new(:warnings) do
    def warn(*args, **kwargs)
      warnings << [args, kwargs]
    end
  end
  ObjectsStub = Struct.new(:objects) do
    def all = objects
  end

  def test_collects_common_plan_paths_with_traceable_sources
    wall_entity = FakeEntity.new
    floor_entity = FakeEntity.new
    JiraNot::ConstructFlow::Architecture::WallRepository.new.write(
      wall_entity, Wall.new(path_mm: [[0, 0, 0], [1000, 0, 0]])
    )
    JiraNot::ConstructFlow::Architecture::FloorRepository.new.write(
      floor_entity, Floor.new(boundary_mm: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0]])
    )
    runtime = RuntimeStub.new(ObjectsStub.new([
      ObjectStub.new('wall-1', 'architecture.wall', wall_entity),
      ObjectStub.new('floor-1', 'architecture.floor', floor_entity)
    ]))

    references = Collector.new(runtime).paths

    assert_equal %w[wall-1 floor-1], references.map { |reference| reference[:source_object_id] }
    assert_equal 2, references.length
  end

  def test_collects_roof_footprint_as_shared_plan_reference
    roof_entity = FakeEntity.new
    JiraNot::ConstructFlow::Roof::Repository.new.write_roof(
      roof_entity,
      JiraNot::ConstructFlow::Roof::RoofDefinition.new(
        boundary_mm: [[0, 0, 3000], [4000, 0, 3000], [4000, 3000, 3000], [0, 3000, 3000]]
      )
    )
    runtime = RuntimeStub.new(ObjectsStub.new([ObjectStub.new('roof-1', 'roof.system', roof_entity)]))

    references = Collector.new(runtime).paths

    assert_equal ['roof-1'], references.map { |reference| reference[:source_object_id] }
    assert_equal [[0.0, 0.0, 3000.0], [4000.0, 0.0, 3000.0], [4000.0, 3000.0, 3000.0], [0.0, 3000.0, 3000.0]], references.first[:path_mm]
  end

  def test_filters_plan_references_by_level_when_requested
    first_entity = FakeEntity.new
    second_entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Architecture::WallRepository.new
    repository.write(first_entity, Wall.new(path_mm: [[0, 0, 0], [1000, 0, 0]]))
    repository.write(second_entity, Wall.new(path_mm: [[0, 1000, 0], [1000, 1000, 0]]))
    runtime = RuntimeStub.new(ObjectsStub.new([
      LevelObjectStub.new('wall-l1', 'architecture.wall', first_entity, [{ 'level_id' => 'level.1' }]),
      LevelObjectStub.new('wall-l2', 'architecture.wall', second_entity, [{ 'level_id' => 'level.2' }])
    ]))

    references = Collector.new(runtime).paths(level_id: 'level.2')

    assert_equal ['wall-l2'], references.map { |reference| reference[:source_object_id] }
  end

  def test_filters_legacy_string_level_references_without_dropping_the_object
    entity = FakeEntity.new
    JiraNot::ConstructFlow::Architecture::WallRepository.new.write(
      entity, Wall.new(path_mm: [[0, 0, 0], [1000, 0, 0]])
    )
    runtime = RuntimeStub.new(ObjectsStub.new([
      LevelObjectStub.new('wall-legacy', 'architecture.wall', entity, ['level.legacy'])
    ]))

    references = Collector.new(runtime).paths(level_id: 'level.legacy')

    assert_equal ['wall-legacy'], references.map { |reference| reference[:source_object_id] }
  end

  def test_uses_semantic_definition_level_when_level_refs_are_missing
    entity = FakeEntity.new
    JiraNot::ConstructFlow::Architecture::WallRepository.new.write(
      entity, Wall.new(path_mm: [[0, 0, 0], [1000, 0, 0]], base_level_id: 'level.1')
    )
    runtime = RuntimeStub.new(ObjectsStub.new([
      LevelObjectStub.new('wall-semantic', 'architecture.wall', entity, [])
    ]))

    references = Collector.new(runtime).paths(level_id: 'level.2')

    assert_empty references
  end

  def test_collects_surface_and_drainage_references
    surface_entity = FakeEntity.new
    route_entity = FakeEntity.new
    JiraNot::ConstructFlow::Surface::Repository.new.write_surface(
      surface_entity,
      JiraNot::ConstructFlow::Surface::SurfaceDefinition.new(
        outer_boundary_mm: [[0, 0, 0], [2000, 0, 0], [2000, 1000, 0]]
      )
    )
    JiraNot::ConstructFlow::Drainage::Repository.new.write_pipe_route(
      route_entity,
      JiraNot::ConstructFlow::Drainage::PipeRouteDefinition.new(
        system: 'rainwater', route_nodes_mm: [[0, 0, 0], [1000, 0, -50]],
        start_connector_id: 'start', end_connector_id: 'end'
      )
    )
    runtime = RuntimeStub.new(ObjectsStub.new([
      ObjectStub.new('surface-1', 'surface.boundary', surface_entity),
      ObjectStub.new('route-1', 'drainage.pipe_route', route_entity)
    ]))

    references = Collector.new(runtime).paths

    assert_equal %w[surface-1 route-1], references.map { |reference| reference[:source_object_id] }
    assert_equal [[0.0, 0.0, 0.0], [1000.0, 0.0, -50.0]], references.last[:path_mm]
  end

  def test_reports_malformed_reference_without_dropping_other_objects
    broken_entity = Class.new(FakeEntity) do
      def get_attribute(*)
        raise IOError, 'attribute read failed'
      end
    end.new
    broken = ObjectStub.new('broken-1', 'architecture.wall', broken_entity)
    valid_entity = FakeEntity.new
    JiraNot::ConstructFlow::Architecture::WallRepository.new.write(
      valid_entity, Wall.new(path_mm: [[0, 0, 0], [1000, 0, 0]])
    )
    valid = ObjectStub.new('wall-1', 'architecture.wall', valid_entity)
    diagnostics = DiagnosticsStub.new([])
    runtime = Struct.new(:smart_objects, :diagnostics).new(ObjectsStub.new([broken, valid]), diagnostics)

    references = Collector.new(runtime).paths

    assert_equal ['wall-1'], references.map { |reference| reference[:source_object_id] }
    assert_equal 'broken-1', diagnostics.warnings.first.last[:object_id]
    assert_equal 'architecture.wall', diagnostics.warnings.first.last[:object_type]
  end
end
