# frozen_string_literal: true

require_relative '../test_helper'

class StructureLevelDependencyTest < Minitest::Test
  Level = Struct.new(:elevation_mm)
  Levels = Struct.new(:values) do
    def fetch(id)
      values.fetch(id.to_s)
    end
  end
  Runtime = Struct.new(:smart_objects, :levels, :events, :diagnostics)
  StructureLevelEvents = Struct.new(:published) do
    def publish(*args, **kwargs)
      published << [args, kwargs]
    end
  end
  StructureLevelDiagnostics = Struct.new(:warnings) do
    def warn(*args, **kwargs)
      warnings << [args, kwargs]
    end
  end
  GeometryRecorder = Struct.new(:rebuilds) do
    def rebuild_column!(entity, definition)
      rebuilds << [entity, definition]
      entity
    end

    def rebuild_foundation!(entity, definition)
      rebuilds << [entity, definition]
      entity
    end

    def rebuild_beam!(entity, definition)
      rebuilds << [entity, definition]
      entity
    end
  end

  def test_level_change_rebuilds_constrained_column_and_publishes_geometry_change
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Structure::Repository.new
    definition = JiraNot::ConstructFlow::Structure::ColumnDefinition.new(
      location_mm: [1000, 2000, 100],
      section_mm: [200, 300],
      base_level_id: 'level.1',
      top_level_id: 'level.2',
      base_offset_mm: 50,
      top_offset_mm: 25,
      base_elevation_mm: 100,
      top_elevation_mm: 3025
    )
    repository.write_column(entity, definition)
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    object = manager.create(entity: entity, type: 'structure.column', owner_module: 'constructflow.structure')
    runtime = Runtime.new(
      manager,
      Levels.new({ 'level.1' => Level.new(200.0), 'level.2' => Level.new(3200.0) }),
      StructureLevelEvents.new([]),
      StructureLevelDiagnostics.new([])
    )
    geometry = GeometryRecorder.new([])

    JiraNot::ConstructFlow::Structure::Registration.reconcile_level_dependents(
      runtime, repository, geometry, { payload: { after: { 'id' => 'level.2' } } }
    )

    updated = repository.read_column(entity)
    assert_equal 1, geometry.rebuilds.length
    assert_equal 250.0, updated.base_elevation_mm
    assert_equal 3225.0, updated.top_elevation_mm
    assert_equal [1000.0, 2000.0, 250.0], updated.location_mm
    assert_equal [object.id], runtime.events.published.first[1][:object_ids]
    assert_equal 'level.2', runtime.events.published.first[0][1][:level_ids].first
  end

  def test_level_change_ignores_unconstrained_columns
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Structure::Repository.new
    definition = JiraNot::ConstructFlow::Structure::ColumnDefinition.new(
      location_mm: [0, 0, 0], base_elevation_mm: 0, top_elevation_mm: 2800
    )
    repository.write_column(entity, definition)
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    manager.create(entity: entity, type: 'structure.column', owner_module: 'constructflow.structure')
    runtime = Runtime.new(manager, Levels.new({ 'level.1' => Level.new(100.0) }), StructureLevelEvents.new([]), StructureLevelDiagnostics.new([]))

    JiraNot::ConstructFlow::Structure::Registration.reconcile_level_dependents(
      runtime, repository, GeometryRecorder.new([]), { payload: { level_id: 'level.1' } }
    )

    assert_empty runtime.events.published
  end

  def test_level_change_moves_foundation_supported_by_rebuilt_column
    column_entity = FakeEntity.new
    foundation_entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Structure::Repository.new
    repository.write_column(column_entity, JiraNot::ConstructFlow::Structure::ColumnDefinition.new(
      location_mm: [1000, 2000, 100], base_level_id: 'level.1', base_elevation_mm: 100, top_elevation_mm: 3000
    ))
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    column = manager.create(entity: column_entity, type: 'structure.column', owner_module: 'constructflow.structure')
    repository.write_foundation(foundation_entity, JiraNot::ConstructFlow::Structure::FoundationDefinition.new(
      center_mm: [1000, 2000, 100], top_elevation_mm: 150, supported_object_id: column.id
    ))
    foundation = manager.create(entity: foundation_entity, type: 'structure.foundation', owner_module: 'constructflow.structure')
    runtime = Runtime.new(
      manager,
      Levels.new({ 'level.1' => Level.new(200.0) }),
      StructureLevelEvents.new([]),
      StructureLevelDiagnostics.new([])
    )
    geometry = GeometryRecorder.new([])

    JiraNot::ConstructFlow::Structure::Registration.reconcile_level_dependents(
      runtime, repository, geometry, { payload: { level_id: 'level.1' } }
    )

    updated = repository.read_foundation(foundation_entity)
    assert_equal [1000.0, 2000.0, 200.0], updated.center_mm
    assert_equal 250.0, updated.top_elevation_mm
    assert_includes runtime.events.published.first[1][:object_ids], foundation.id
  end

  def test_level_change_rebuilds_level_constrained_beam
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Structure::Repository.new
    repository.write_beam(entity, JiraNot::ConstructFlow::Structure::BeamDefinition.new(
      path_mm: [[0, 0, 100], [3000, 0, 100]], base_level_id: 'level.1', base_elevation_mm: 100
    ))
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    object = manager.create(entity: entity, type: 'structure.beam', owner_module: 'constructflow.structure')
    runtime = Runtime.new(
      manager, Levels.new({ 'level.1' => Level.new(250.0) }), StructureLevelEvents.new([]), StructureLevelDiagnostics.new([])
    )
    geometry = GeometryRecorder.new([])

    JiraNot::ConstructFlow::Structure::Registration.reconcile_level_dependents(
      runtime, repository, geometry, { payload: { level_id: 'level.1' } }
    )

    updated = repository.read_beam(entity)
    assert_equal [[0.0, 0.0, 250.0], [3000.0, 0.0, 250.0]], updated.path_mm
    assert_equal [object.id], runtime.events.published.first[1][:object_ids]
  end
end
