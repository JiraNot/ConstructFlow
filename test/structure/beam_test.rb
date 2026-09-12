# frozen_string_literal: true

require_relative '../test_helper'

class StructureBeamTest < Minitest::Test
  BeamObject = Struct.new(:id, :type, :entity)
  Runtime = Struct.new(:smart_objects)
  SmartObjects = Struct.new(:objects) do
    def all
      objects
    end
  end

  ScheduleRuntime = Struct.new(:active_model, :smart_objects, :commands, :project)
  ScheduleProject = Struct.new(:project_id)
  ScheduleCommands = Struct.new(:calls) do
    def execute(name, input, project_id:)
      calls << { name: name, input: input, project_id: project_id }
      { status: 'success' }
    end
  end

  def beam_definition
    JiraNot::ConstructFlow::Structure::BeamDefinition.new(
      path_mm: [[0, 0, 3000], [4000, 0, 3000]], section_mm: [250, 400], base_level_id: 'L1', base_elevation_mm: 3000
    )
  end

  def test_beam_definition_round_trips_and_reports_volume
    definition = beam_definition
    assert definition.valid?
    assert_in_delta 4_000.0 * 250.0 * 400.0, definition.volume_mm3, 0.001
    assert_equal definition.to_h, JiraNot::ConstructFlow::Structure::BeamDefinition.from_h(definition.to_h).to_h
  end

  def test_beam_is_exposed_as_a_shared_plan_reference
    entity = FakeEntity.new
    JiraNot::ConstructFlow::Structure::Repository.new.write_beam(entity, beam_definition)
    runtime = Runtime.new(SmartObjects.new([BeamObject.new('beam-1', 'structure.beam', entity)]))

    reference = JiraNot::ConstructFlow::Architecture::PlanReferenceCollector.new(runtime).paths.first

    assert_equal [[0.0, 0.0, 3000.0], [4000.0, 0.0, 3000.0]], reference[:path_mm]
    assert_equal 'beam-1', reference[:source_object_id]
  end

  def test_beam_syncs_supported_by_relationships_to_columns_and_walls
    column_entity = FakeEntity.new
    wall_entity = FakeEntity.new
    beam_entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Structure::Repository.new
    repository.write_column(column_entity, JiraNot::ConstructFlow::Structure::ColumnDefinition.new(
      location_mm: [0, 0, 0], base_elevation_mm: 0, top_elevation_mm: 3000
    ))
    wall_repository = JiraNot::ConstructFlow::Architecture::WallRepository.new
    wall_repository.write(wall_entity, JiraNot::ConstructFlow::Architecture::WallDefinition.new(
      path_mm: [[3000, 0, 0], [6000, 0, 0]]
    ))
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    column = manager.create(entity: column_entity, type: 'structure.column', owner_module: 'constructflow.structure')
    wall = manager.create(entity: wall_entity, type: 'architecture.wall', owner_module: 'constructflow.architecture')
    beam = manager.create(entity: beam_entity, type: 'structure.beam', owner_module: 'constructflow.structure')
    definition = JiraNot::ConstructFlow::Structure::BeamDefinition.new(
      path_mm: [[0, 0, 0], [3000, 0, 0]], base_elevation_mm: 0
    )
    runtime = Struct.new(:smart_objects).new(manager)

    JiraNot::ConstructFlow::Structure::Registration.sync_beam_supports(runtime, beam, definition)

    updated_beam = manager.fetch_by_id(beam.id)
    supported_ids = updated_beam.relationships.select { |item| item['kind'] == 'supported_by' }.map { |item| item['target_id'] }
    assert_equal [column.id, wall.id].sort, supported_ids.sort
    assert manager.fetch_by_id(wall.id).relationships.any? { |item| item['kind'] == 'supports' && item['target_id'] == beam.id }
    assert manager.fetch_by_id(column.id).relationships.any? { |item| item['kind'] == 'supports' && item['target_id'] == beam.id }
  end

  def test_beam_quantities_are_traceable_and_phase_aware
    object = Struct.new(:id, :removed_phase, :created_phase, :source_state).new(
      'beam-1', nil, JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION, 'confirmed'
    )
    items = JiraNot::ConstructFlow::Structure::Quantity::StructureQuantityProvider.new.beam_quantities(
      smart_object: object, definition: beam_definition
    )

    concrete = items.find { |item| item[:measure] == 'volume' }
    assert_equal 'beam-1', concrete[:source_object_id]
    assert_equal 'm3', concrete[:unit]
    assert_in_delta 0.4, concrete[:value], 0.001
    assert_equal JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION, concrete[:phase_scope]
  end

  def test_beam_schedule_delegates_editable_fields_and_protects_calculated_values
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Structure::Repository.new
    repository.write_beam(entity, beam_definition)
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    object = manager.create(entity: entity, type: 'structure.beam', owner_module: 'constructflow.structure')
    commands = ScheduleCommands.new([])
    runtime = ScheduleRuntime.new(FakeModel.new, manager, commands, ScheduleProject.new('project-1'))
    editor = JiraNot::ConstructFlow::Structure::Registration.schedule_editor(runtime)
    row = editor.rows([object]).first

    assert_in_delta 4.0, row['values']['length_m'], 0.001
    assert_raises(ArgumentError) { editor.edit(row: row, field_id: 'volume_m3', value: 2) }
    updated = editor.edit(row: row, field_id: 'material', value: 'steel')

    assert_equal 'steel', updated['values']['material']
    assert_equal 'EditBeamSchedule', commands.calls.first[:name]
  end
end
