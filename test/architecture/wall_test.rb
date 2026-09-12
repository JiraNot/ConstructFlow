# frozen_string_literal: true

require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/registration'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/wall_geometry'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/tools/wall_edit_tool'

class WallDefinitionTest < Minitest::Test
  WallDefinition = JiraNot::ConstructFlow::Architecture::WallDefinition

  Level = Struct.new(:elevation_mm)
  Levels = Struct.new(:values) do
    def fetch(id)
      values.fetch(id.to_s)
    end
  end
  Runtime = Struct.new(:levels)

  LevelReconcileRuntime = Struct.new(:smart_objects, :levels, :events, :diagnostics)
  Events = Struct.new(:published) do
    def publish(*args, **kwargs)
      published << [args, kwargs]
    end
  end
  Diagnostics = Struct.new(:warnings) do
    def warn(*args, **kwargs)
      warnings << [args, kwargs]
    end
  end
  GeometryRecorder = Struct.new(:rebuilds) do
    def rebuild!(entity, definition, openings: [])
      rebuilds << [entity, definition, openings]
      entity
    end
  end

  def test_wall_calculates_length_area_and_volume
    wall = WallDefinition.new(
      path_mm: [[0, 0, 0], [3_000, 4_000, 0]],
      thickness_mm: 100,
      height_mm: 2_800
    )

    assert_in_delta 5_000.0, wall.length_mm, 0.001
    assert_in_delta 14_000_000.0, wall.gross_area_mm2, 0.001
    assert_in_delta 1_400_000_000.0, wall.volume_mm3, 0.001
  end

  def test_wall_definition_is_immutable_but_can_derive_updated_copy
    wall = WallDefinition.new(path_mm: [[0, 0, 0], [1_000, 0, 0]])
    changed = wall.with(thickness_mm: 150)

    assert_equal 100.0, wall.thickness_mm
    assert_equal 150.0, changed.thickness_mm
    assert_equal wall.path_mm, changed.path_mm
  end

  def test_wall_schedule_exposes_calculated_values_and_routes_editable_type_fields
    entity = FakeEntity.new
    definition = WallDefinition.new(
      path_mm: [[0, 0, 0], [3_000, 0, 0]], thickness_mm: 150, height_mm: 2_800,
      wall_type_id: 'external.block'
    )
    JiraNot::ConstructFlow::Architecture::WallRepository.new.write(entity, definition)
    object = Struct.new(:id, :type, :entity).new('wall-1', 'architecture.wall', entity)
    commands = Struct.new(:calls) do
      def execute(*args, **kwargs)
        calls << [args, kwargs]
        { status: 'success', updated_object_ids: ['wall-1'], events: [] }
      end
    end.new([])
    runtime = Struct.new(:commands, :project).new(commands, Struct.new(:project_id).new('project-1'))

    editor = JiraNot::ConstructFlow::Architecture::Registration.wall_schedule_editor(runtime)
    row = editor.rows([object]).first
    updated = editor.edit(row: row, field_id: 'thickness_mm', value: '200')

    assert_equal 3.0, row['values']['length_m']
    assert_equal 2_800.0 / 1000.0, row['values']['height_m']
    assert_equal 'external.block', row['values']['wall_type_id']
    assert_equal 200.0, updated['values']['thickness_mm']
    assert_equal 'EditWallSchedule', commands.calls.first[0].first
    assert_equal 'thickness_mm', commands.calls.first[0][1][:field_id]
  end

  def test_wall_can_translate_without_mutating_original_path
    wall = WallDefinition.new(path_mm: [[0, 0, 0], [1_000, 0, 0]])
    moved = wall.translated([250, 400, 0])

    assert_equal [[0.0, 0.0, 0.0], [1_000.0, 0.0, 0.0]], wall.path_mm
    assert_equal [[250.0, 400.0, 0.0], [1_250.0, 400.0, 0.0]], moved.path_mm
  end

  def test_wall_can_flip_orientation_without_changing_path
    wall = WallDefinition.new(path_mm: [[0, 0, 0], [1_000, 0, 0]], orientation: 'left')

    flipped = wall.flipped_orientation

    assert_equal 'right', flipped.orientation
    assert_equal wall.path_mm, flipped.path_mm
    assert_equal 'left', wall.orientation
  end

  def test_wall_can_stretch_one_endpoint
    wall = WallDefinition.new(path_mm: [[0, 0, 0], [1_000, 0, 0], [1_000, 1_000, 0]])
    stretched = wall.stretched_endpoint(index: 1, point_mm: [1_200, 0, 0])

    assert_equal [[0.0, 0.0, 0.0], [1_200.0, 0.0, 0.0], [1_000.0, 1_000.0, 0.0]], stretched.path_mm
  end

  def test_wall_can_translate_only_the_selected_segment
    wall = WallDefinition.new(path_mm: [[0, 0, 0], [1_000, 0, 0], [1_000, 1_000, 0]])
    moved = wall.translated_segment(index: 0, delta_mm: [0, 250, 0])

    assert_equal [[0.0, 250.0, 0.0], [1_000.0, 250.0, 0.0], [1_000.0, 1_000.0, 0.0]], moved.path_mm
    assert_equal [[0.0, 0.0, 0.0], [1_000.0, 0.0, 0.0], [1_000.0, 1_000.0, 0.0]], wall.path_mm
  end

  def test_zero_thickness_and_zero_length_segment_are_invalid
    wall = WallDefinition.new(
      path_mm: [[0, 0, 0], [0, 0, 0]],
      thickness_mm: 0,
      height_mm: 2_800
    )

    refute wall.valid?
    assert_includes wall.errors, 'wall thickness must be greater than zero'
    assert_includes wall.errors, 'wall path contains zero-length segment'
  end

  def test_supports_layered_wall_contract_and_core_location_line
    wall = WallDefinition.new(
      path_mm: [[0, 0, 0], [3000, 0, 0]], thickness_mm: 200,
      layers: [
        { id: 'finish.exterior', thickness_mm: 20, material_id: 'render', role: 'finish' },
        { id: 'core', thickness_mm: 160, material_id: 'block', role: 'core' },
        { id: 'finish.interior', thickness_mm: 20, material_id: 'plaster', role: 'finish' }
      ], core_layer_id: 'core', base_level_id: 'level.1', top_constraint: 'level',
      top_constraint_level_id: 'level.2', location_line: 'core_center',
      phase_lifecycle: 'new', room_bounding: true
    )

    assert wall.valid?
    assert_equal 3, wall.layers.length
    assert_equal 'core', wall.core_layer_id
    assert_equal 'level.2', wall.top_constraint_level_id
    assert_equal wall.to_h, WallDefinition.from_h(wall.to_h).to_h
  end

  def test_create_input_resolves_base_and_top_level_constraint_to_path_and_height
    runtime = Runtime.new(Levels.new({ 'level.1' => Level.new(100.0), 'level.2' => Level.new(3_000.0) }))

    wall = JiraNot::ConstructFlow::Architecture::Registration.definition_from_input(
      {
        path_mm: [[0, 0, 0], [3_000, 0, 0]],
        base_level_id: 'level.1',
        base_offset_mm: 50,
        top_constraint: 'level',
        top_constraint_level_id: 'level.2',
        top_offset_mm: 25
      },
      runtime
    )

    assert_equal [[0.0, 0.0, 150.0], [3_000.0, 0.0, 150.0]], wall.path_mm
    assert_in_delta 2_875.0, wall.height_mm, 0.001
  end

  def test_level_constraint_is_reapplied_after_path_edit
    runtime = Runtime.new(Levels.new({ 'level.1' => Level.new(100.0), 'level.2' => Level.new(3_000.0) }))
    wall = WallDefinition.new(
      path_mm: [[0, 0, 150], [3_000, 0, 150]], base_level_id: 'level.1', base_offset_mm: 50,
      top_constraint: 'level', top_constraint_level_id: 'level.2', top_offset_mm: 25
    )

    updated = JiraNot::ConstructFlow::Architecture::Registration.apply_level_constraints(
      wall.stretched_endpoint(index: 1, point_mm: [4_000, 0, 999]), runtime
    )

    assert_equal [[0.0, 0.0, 150.0], [4_000.0, 0.0, 150.0]], updated.path_mm
    assert_in_delta 2_875.0, updated.height_mm, 0.001
  end

  def test_wall_constraints_project_path_before_geometry_and_round_trip
    wall = WallDefinition.new(
      path_mm: [[0, 0, 0], [1_000, 250, 0]],
      constraints: [{ kind: 'level', target: 'p1', level_z: 350 }]
    )

    constrained = wall.apply_constraints

    assert_equal 350.0, constrained.path_mm[1][2]
    assert_equal wall.constraints, WallDefinition.from_h(wall.to_h).constraints
    assert constrained.valid?
  end

  def test_wall_rejects_invalid_constraint_schema_before_rebuild
    wall = WallDefinition.new(
      path_mm: [[0, 0, 0], [1_000, 0, 0]],
      constraints: [{ kind: 'align', target: 'p1' }]
    )

    refute wall.valid?
    assert_includes wall.errors, 'wall constraint 0: constraint source required'
  end

  def test_level_change_rebuilds_constrained_wall_and_publishes_geometry_change
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Architecture::WallRepository.new
    repository.write(
      entity,
      WallDefinition.new(
        path_mm: [[0, 0, 100], [3_000, 0, 100]], base_level_id: 'level.1',
        top_constraint: 'level', top_constraint_level_id: 'level.2'
      )
    )
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    object = manager.create(entity: entity, type: 'architecture.wall', owner_module: 'constructflow.architecture')
    levels = Levels.new({ 'level.1' => Level.new(100.0), 'level.2' => Level.new(3_100.0) })
    events = Events.new([])
    geometry = GeometryRecorder.new([])
    runtime = LevelReconcileRuntime.new(manager, levels, events, Diagnostics.new([]))

    JiraNot::ConstructFlow::Architecture::Registration.reconcile_level_dependents(
      runtime, repository, geometry, { payload: { after: { 'id' => 'level.2' } } }
    )
    updated = repository.read(entity)

    assert_equal 1, geometry.rebuilds.length
    assert_equal [[0.0, 0.0, 100.0], [3_000.0, 0.0, 100.0]], updated.path_mm
    assert_in_delta 3_000.0, updated.height_mm, 0.001
    assert_equal [object.id], events.published.first[1][:object_ids]
  end

  def test_level_change_rebases_floor_room_and_ceiling_geometry
    floor_entity = FakeEntity.new
    room_entity = FakeEntity.new
    ceiling_entity = FakeEntity.new
    floor_repository = JiraNot::ConstructFlow::Architecture::FloorRepository.new
    room_repository = JiraNot::ConstructFlow::Architecture::RoomRepository.new
    ceiling_repository = JiraNot::ConstructFlow::Architecture::CeilingRepository.new
    floor_repository.write(floor_entity, JiraNot::ConstructFlow::Architecture::FloorDefinition.new(
      boundary_mm: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0]], level_id: 'level.1', offset_mm: 10
    ))
    room_repository.write(room_entity, JiraNot::ConstructFlow::Architecture::RoomDefinition.new(
      boundary_mm: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0]], level_id: 'level.1', name: 'Room'
    ))
    ceiling_repository.write(ceiling_entity, JiraNot::ConstructFlow::Architecture::CeilingDefinition.new(
      boundary_mm: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0]], level_id: 'level.1', height_mm: 2700, offset_mm: 20
    ))
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    floor = manager.create(entity: floor_entity, type: 'architecture.floor', owner_module: 'constructflow.architecture')
    room = manager.create(entity: room_entity, type: 'architecture.room', owner_module: 'constructflow.architecture')
    ceiling = manager.create(entity: ceiling_entity, type: 'architecture.ceiling', owner_module: 'constructflow.architecture')
    levels = Levels.new({ 'level.1' => Level.new(200.0) })
    runtime = LevelReconcileRuntime.new(manager, levels, Events.new([]), Diagnostics.new([]))

    JiraNot::ConstructFlow::Architecture::Registration.reconcile_level_surface_dependents(
      runtime, floor_repository, GeometryRecorder.new([]), room_repository, GeometryRecorder.new([]),
      ceiling_repository, GeometryRecorder.new([]), { payload: { after: { 'id' => 'level.1' } } }
    )

    assert_equal 210.0, floor_repository.read(floor_entity).boundary_mm.first[2]
    assert_equal 200.0, room_repository.read(room_entity).boundary_mm.first[2]
    assert_equal 2920.0, ceiling_repository.read(ceiling_entity).boundary_mm.first[2]
    assert_equal [floor.id, room.id, ceiling.id].sort, runtime.smart_objects.all.map(&:id).sort
  end

  def test_classifies_and_resolves_wall_join_styles
    first = WallDefinition.new(path_mm: [[0, 0, 0], [3000, 0, 0]])
    second = WallDefinition.new(path_mm: [[3000, 0, 0], [3000, 2000, 0]])
    engine = JiraNot::ConstructFlow::Architecture::WallJoinEngine.new

    join = engine.resolve(wall_a: first, wall_b: second, style: 'butt')

    assert_equal 'L', join[:type]
    assert_equal 'butt', join[:style]
    assert join[:resolved]
  end

  def test_classifies_t_and_x_intersections
    engine = JiraNot::ConstructFlow::Architecture::WallJoinEngine.new
    trunk = WallDefinition.new(path_mm: [[0, 0, 0], [3000, 0, 0]])
    branch = WallDefinition.new(path_mm: [[1500, 0, 0], [1500, 1200, 0]])
    diagonal_a = WallDefinition.new(path_mm: [[0, -500, 0], [3000, 500, 0]])
    diagonal_b = WallDefinition.new(path_mm: [[0, 500, 0], [3000, -500, 0]])

    assert_equal 'T', engine.classify(wall_a: branch, wall_b: trunk)[:type]
    assert_equal 'X', engine.classify(wall_a: diagonal_a, wall_b: diagonal_b)[:type]
  end

  def test_wall_mutations_reconcile_symmetric_join_records_and_remove_stale_joins
    first_entity = FakeEntity.new
    second_entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Architecture::WallRepository.new
    repository.write(first_entity, WallDefinition.new(path_mm: [[0, 0, 0], [3_000, 0, 0]]))
    repository.write(second_entity, WallDefinition.new(path_mm: [[3_000, 0, 0], [3_000, 2_000, 0]]))
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    first = manager.create(entity: first_entity, type: 'architecture.wall', owner_module: 'constructflow.architecture')
    second = manager.create(entity: second_entity, type: 'architecture.wall', owner_module: 'constructflow.architecture')
    runtime = Struct.new(:smart_objects).new(manager)

    JiraNot::ConstructFlow::Architecture::Registration.reconcile_wall_joins(runtime, repository)

    assert_equal second.id, repository.read(first_entity).joins.first['related_wall_id']
    assert_equal first.id, repository.read(second_entity).joins.first['related_wall_id']
    assert_equal 'L', repository.read(first_entity).joins.first['type']
    assert_equal [3_000.0, 0.0, 0.0], repository.read(first_entity).joins.first['point_mm']
    assert_equal 'miter', repository.read(first_entity).joins.first['style']

    repository.write(second_entity, repository.read(second_entity).translated([0, 1_000, 0]))
    changed = JiraNot::ConstructFlow::Architecture::Registration.reconcile_wall_joins(runtime, repository)

    assert_empty repository.read(first_entity).joins
    assert_empty repository.read(second_entity).joins
    assert_includes changed, first.id
    assert_includes changed, second.id
  end

  def test_wall_join_reconciliation_preserves_disallow_style
    first_entity = FakeEntity.new
    second_entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Architecture::WallRepository.new
    repository.write(first_entity, WallDefinition.new(
      path_mm: [[0, 0, 0], [3_000, 0, 0]],
      joins: [{ related_wall_id: 'wall-2', style: 'disallow', allow: false }]
    ))
    repository.write(second_entity, WallDefinition.new(path_mm: [[3_000, 0, 0], [3_000, 2_000, 0]]))
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    first = manager.create(entity: first_entity, type: 'architecture.wall', owner_module: 'constructflow.architecture')
    second = manager.create(entity: second_entity, type: 'architecture.wall', owner_module: 'constructflow.architecture')
    repository.write(first_entity, repository.read(first_entity).with(
      joins: [{ related_wall_id: second.id, style: 'disallow', allow: false }]
    ))
    runtime = Struct.new(:smart_objects).new(manager)

    JiraNot::ConstructFlow::Architecture::Registration.reconcile_wall_joins(runtime, repository)

    join = repository.read(first_entity).joins.find { |item| item['related_wall_id'] == second.id }
    assert_equal 'disallow', join['style']
    refute join['allow']
    assert_equal first.id, repository.read(second_entity).joins.first['related_wall_id']
  end

  def test_wall_geometry_change_reconciles_only_wall_generated_rooms
    entities = 4.times.map { FakeEntity.new }
    repository = JiraNot::ConstructFlow::Architecture::WallRepository.new
    paths = [
      [[0, 0, 0], [3_000, 0, 0]],
      [[3_000, 0, 0], [3_000, 3_000, 0]],
      [[3_000, 3_000, 0], [0, 3_000, 0]],
      [[0, 3_000, 0], [0, 0, 0]]
    ]
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    walls = entities.each_with_index.map do |entity, index|
      repository.write(entity, WallDefinition.new(path_mm: paths[index]))
      manager.create(entity: entity, type: 'architecture.wall', owner_module: 'constructflow.architecture')
    end
    room_entity = FakeEntity.new
    room_repository = JiraNot::ConstructFlow::Architecture::RoomRepository.new
    room_repository.write(room_entity, JiraNot::ConstructFlow::Architecture::RoomDefinition.new(
      boundary_mm: [[100, 100, 0], [200, 100, 0], [200, 200, 0]], name: 'Tracked',
      finish_metadata: { 'generated_from_walls' => true, 'source_wall_ids' => walls.map(&:id) }
    ))
    tracked = manager.create(entity: room_entity, type: 'architecture.room', owner_module: 'constructflow.architecture')
    manual_entity = FakeEntity.new
    room_repository.write(manual_entity, JiraNot::ConstructFlow::Architecture::RoomDefinition.new(
      boundary_mm: [[500, 500, 0], [700, 500, 0], [700, 700, 0]], name: 'Manual'
    ))
    manual = manager.create(entity: manual_entity, type: 'architecture.room', owner_module: 'constructflow.architecture')
    runtime = Struct.new(:smart_objects, :events, :diagnostics).new(manager, Events.new([]), Diagnostics.new([]))
    geometry = GeometryRecorder.new([])

    changed = JiraNot::ConstructFlow::Architecture::Registration.reconcile_wall_enclosure_rooms(
      runtime, repository, room_repository, geometry, [walls.first.id], caused_by_command_id: 'cmd-wall-edit'
    )

    assert_includes changed, tracked.id
    assert_equal 9_000_000.0, room_repository.read(room_entity).area_mm2
    assert_equal [[500.0, 500.0, 0.0], [700.0, 500.0, 0.0], [700.0, 700.0, 0.0]], room_repository.read(manual_entity).boundary_mm
    refute_includes changed, manual.id
    assert_equal 'cmd-wall-edit', runtime.events.published.last.last[:caused_by_command_id]
  end

  def test_location_line_resolves_to_physical_centerline
    wall = WallDefinition.new(
      path_mm: [[0, 0, 0], [3000, 0, 0]], thickness_mm: 200,
      location_line: 'finish_face_exterior'
    )

    assert_equal [[0.0, -100.0, 0.0], [3000.0, -100.0, 0.0]], wall.centerline_path_mm
  end

  def test_wall_edit_session_uses_selected_wall_level_for_plan_references
    tool = JiraNot::ConstructFlow::Architecture::Tools::WallEditTool.allocate
    object = Struct.new(:level_refs).new([{ 'level_id' => 'level.2' }])
    definition = WallDefinition.new(path_mm: [[0, 0, 0], [3000, 0, 0]])

    assert_equal 'level.2', tool.send(:editing_level_id, object, definition)
  end

  def test_numeric_middle_vertex_stretch_uses_adjacent_anchor
    interaction = Class.new do
      attr_reader :anchor

      def segment_preview(anchor, _cursor, **_options)
        @anchor = anchor
        { finish_mm: [1500.0, 1200.0, 0.0] }
      end
    end.new
    tool = JiraNot::ConstructFlow::Architecture::Tools::WallEditTool.allocate
    tool.instance_variable_set(:@interaction, interaction)
    tool.instance_variable_set(:@definition, WallDefinition.new(
      path_mm: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0], [2000, 1000, 0]]
    ))
    tool.instance_variable_set(:@endpoint_index, 2)
    tool.instance_variable_set(:@numeric_length_mm, 500)
    tool.instance_variable_set(:@constraint_mode, :free)

    tool.send(:stretch_cursor_point, [1300, 1200, 0])

    assert_equal [1000.0, 0.0, 0.0], interaction.anchor
  end

  def test_wall_edit_relative_numeric_stretch_adds_to_current_segment_length
    tool = JiraNot::ConstructFlow::Architecture::Tools::WallEditTool.allocate
    tool.instance_variable_set(:@interaction, JiraNot::ConstructFlow::Core::PlanInteractionEngine.new)
    tool.instance_variable_set(:@definition, WallDefinition.new(path_mm: [[0, 0, 0], [3000, 0, 0]]))
    tool.instance_variable_set(:@endpoint_index, 1)
    tool.instance_variable_set(:@action, :stretch)

    assert_equal 3500.0, tool.send(:typed_stretch_length, '+500 mm')
    assert_equal 2500.0, tool.send(:typed_stretch_length, '-500 mm')
    assert_equal 1200.0, tool.send(:typed_stretch_length, '1200 mm')
  end

  def test_wall_geometry_builds_one_continuous_mitered_outline_for_polyline
    geometry = JiraNot::ConstructFlow::Architecture::WallGeometry.new
    outline = geometry.outline_points_mm(
      path_mm: [[0, 0, 0], [3_000, 0, 0], [3_000, 2_000, 0]], thickness_mm: 200
    )

    assert_equal 6, outline.length
    assert_in_delta 100.0, outline.first[1], 0.001
    assert_in_delta 2_900.0, outline[2][0], 0.001
  end
end

class WallRepositoryTest < Minitest::Test
  def test_architecture_payload_round_trips_without_writing_core_namespace
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Architecture::WallRepository.new
    definition = JiraNot::ConstructFlow::Architecture::WallDefinition.new(
      path_mm: [[0, 0, 450], [3_000, 0, 450]],
      thickness_mm: 125,
      height_mm: 2_700,
      wall_type_id: 'wall.aac.100'
    )

    repository.write(entity, definition)
    recovered = repository.read(entity)

    assert_equal definition.to_h, recovered.to_h
    assert_nil entity.get_attribute('constructflow.core', 'wall_definition', nil)
    refute_nil entity.get_attribute('constructflow.architecture', 'wall_definition', nil)
  end
end

class WallValidatorTest < Minitest::Test
  def test_validator_returns_actionable_rule
    definition = JiraNot::ConstructFlow::Architecture::WallDefinition.new(
      path_mm: [[0, 0, 0], [1_000, 0, 0]],
      height_mm: -1
    )
    issues = JiraNot::ConstructFlow::Architecture::Validators::WallValidator.new.validate(definition)

    assert_equal 1, issues.length
    assert_equal 'architecture.wall.validity', issues.first[:rule]
    assert_equal 'error', issues.first[:severity]
  end
end

class WallQuantityProviderTest < Minitest::Test
  def setup
    @entity = FakeEntity.new
    @smart_object = JiraNot::ConstructFlow::Core::SmartObject.new(
      entity: @entity,
      id: 'cf_wall_001',
      type: 'architecture.wall',
      owner_module: 'constructflow.architecture',
      schema_version: 1,
      display_name: 'Wall',
      created_phase: 'new_construction',
      removed_phase: nil,
      level_refs: [],
      status: 'active',
      relationships: [],
      geometry_refs: [],
      catalog_ref: nil,
      source_state: 'confirmed',
      revision_meta: {},
      created_at: nil,
      updated_at: nil
    )
    @definition = JiraNot::ConstructFlow::Architecture::WallDefinition.new(
      path_mm: [[0, 0, 0], [5_000, 0, 0]],
      thickness_mm: 100,
      height_mm: 2_800
    )
    @provider = JiraNot::ConstructFlow::Architecture::Quantity::WallQuantityProvider.new
  end

  def test_provider_outputs_normalized_traceable_area_and_volume
    items = @provider.quantities(smart_object: @smart_object, definition: @definition)
    area, volume = items

    assert_equal 'cf_wall_001', area[:source_object_id]
    assert_equal 'constructflow.architecture', area[:source_module]
    assert_equal 'architecture.wall.gross_area', area[:classification]
    assert_equal 'm2', area[:unit]
    assert_in_delta 14.0, area[:value], 0.000001
    assert_equal 'new_construction', area[:phase_scope]

    assert_equal 'm3', volume[:unit]
    assert_in_delta 1.4, volume[:value], 0.000001
    assert_equal 1, volume[:formula_version]
  end

  def test_demolished_existing_wall_quantities_are_demolition_scope
    demolished = JiraNot::ConstructFlow::Core::SmartObject.new(
      entity: @entity,
      id: 'cf_wall_existing',
      type: 'architecture.wall',
      owner_module: 'constructflow.architecture',
      schema_version: 1,
      display_name: 'Existing Wall',
      created_phase: 'existing',
      removed_phase: 'demolition',
      level_refs: [],
      status: 'active',
      relationships: [],
      geometry_refs: [],
      catalog_ref: nil,
      source_state: 'measured',
      revision_meta: {},
      created_at: nil,
      updated_at: nil
    )

    items = @provider.quantities(smart_object: demolished, definition: @definition)

    assert items.all? { |item| item[:phase_scope] == 'demolition' }
    assert items.all? { |item| item[:confidence] == 'measured' }
  end

  def test_wall_corner_miter_geometry_at_l_join
    geom = JiraNot::ConstructFlow::Architecture::WallGeometry.new
    thickness = 100.0
    join_w1 = {
      'node_index' => 1,
      'type' => 'L',
      'style' => 'miter',
      'allow' => true,
      'other_vector' => [0.0, 2000.0, 0.0],
      'other_thickness_mm' => thickness
    }
    join_w2 = {
      'node_index' => 0,
      'type' => 'L',
      'style' => 'miter',
      'allow' => true,
      'other_vector' => [-3000.0, 0.0, 0.0],
      'other_thickness_mm' => thickness
    }

    pts1 = geom.outline_points_mm(path_mm: [[0, 0, 0], [3000, 0, 0]], thickness_mm: thickness, joins: [join_w1])
    pts2 = geom.outline_points_mm(path_mm: [[3000, 0, 0], [3000, 2000, 0]], thickness_mm: thickness, joins: [join_w2])

    outer_w1 = pts1.find { |p| p[0] > 3000.0 }
    inner_w1 = pts1.find { |p| p[0] < 3000.0 && p[0] > 2000.0 }
    refute_nil outer_w1
    refute_nil inner_w1
    assert_in_delta 3050.0, outer_w1[0], 0.1
    assert_in_delta(-50.0, outer_w1[1], 0.1)
    assert_in_delta 2950.0, inner_w1[0], 0.1
    assert_in_delta 50.0, inner_w1[1], 0.1

    outer_w2 = pts2.find { |p| p[0] > 3000.0 && p[1] < 100.0 }
    inner_w2 = pts2.find { |p| p[0] < 3000.0 && p[1] < 100.0 }
    refute_nil outer_w2
    refute_nil inner_w2
    assert_in_delta 3050.0, outer_w2[0], 0.1
    assert_in_delta(-50.0, outer_w2[1], 0.1)
    assert_in_delta 2950.0, inner_w2[0], 0.1
    assert_in_delta 50.0, inner_w2[1], 0.1
  end
end
