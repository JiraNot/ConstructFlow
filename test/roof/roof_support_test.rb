# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'architecture', 'registration')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'roof', 'registration')

class RoofSupportReconciliationTest < Minitest::Test
  Runtime = Struct.new(:smart_objects)

  def test_roof_supports_are_symmetric_and_reconcile_when_footprint_moves
    model = FakeModel.new
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: model)
    roof_entity = FakeEntity.new
    wall_entity = FakeEntity.new
    beam_entity = FakeEntity.new
    roof_repository = JiraNot::ConstructFlow::Roof::Repository.new
    wall_repository = JiraNot::ConstructFlow::Architecture::WallRepository.new
    structure_repository = JiraNot::ConstructFlow::Structure::Repository.new
    roof = manager.create(entity: roof_entity, type: 'roof.system', owner_module: 'constructflow.roof')
    wall = manager.create(entity: wall_entity, type: 'architecture.wall', owner_module: 'constructflow.architecture')
    beam = manager.create(entity: beam_entity, type: 'structure.beam', owner_module: 'constructflow.structure')
    wall_repository.write(wall_entity, JiraNot::ConstructFlow::Architecture::WallDefinition.new(
      path_mm: [[0, 0, 0], [4000, 0, 0]]
    ))
    structure_repository.write_beam(beam_entity, JiraNot::ConstructFlow::Structure::BeamDefinition.new(
      path_mm: [[0, 3000, 0], [4000, 3000, 0]], base_elevation_mm: 2800
    ))
    definition = JiraNot::ConstructFlow::Roof::RoofDefinition.new(
      boundary_mm: [[0, 0, 3000], [4000, 0, 3000], [4000, 3000, 3000], [0, 3000, 3000]],
      roof_form: 'flat', slope_percent: 0, low_elevation_mm: 3000
    )
    roof_repository.write_roof(roof_entity, definition)
    runtime = Runtime.new(manager)

    supported = JiraNot::ConstructFlow::Roof::Registration.reconcile_roof_supports(runtime, roof, definition)

    assert_equal [beam.id, wall.id].sort, supported.sort
    roof_relationships = manager.fetch(roof_entity).relationships
    assert_equal supported.sort, roof_relationships.select { |item| item['kind'] == 'supported_by' }.map { |item| item['target_id'] }.sort
    assert manager.fetch(wall_entity).relationships.any? { |item| item['kind'] == 'supports' && item['target_id'] == roof.id }
    assert manager.fetch(beam_entity).relationships.any? { |item| item['kind'] == 'supports' && item['target_id'] == roof.id }

    moved = definition.with(boundary_mm: [[10_000, 10_000, 3000], [14_000, 10_000, 3000], [14_000, 13_000, 3000], [10_000, 13_000, 3000]])
    roof_repository.write_roof(roof_entity, moved)
    assert_empty JiraNot::ConstructFlow::Roof::Registration.reconcile_roof_supports(runtime, roof, moved)
    assert_empty manager.fetch(roof_entity).relationships
    refute manager.fetch(wall_entity).relationships.any? { |item| item['target_id'] == roof.id }
    refute manager.fetch(beam_entity).relationships.any? { |item| item['target_id'] == roof.id }
  end
end
