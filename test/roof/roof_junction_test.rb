# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOF, 'geometry')
require File.join(ROOF, 'registration')

# Roof junction / flashing detail (ported from feat/roof-attachment-junction-v1).
class RoofJunctionTest < Minitest::Test
  SmartObjectStub = Struct.new(
    :id, :entity, :owner_module, :type, :created_phase, :removed_phase, :source_state, :relationships,
    keyword_init: true
  )

  class ObjectsStub
    def initialize(objects)
      @objects = objects
    end

    def all
      @objects
    end

    def fetch_by_id(id)
      @objects.find { |object| object.id.to_s == id.to_s }
    end
  end

  StubRuntime = Struct.new(:smart_objects)

  # Minimal menu surface so the roof module can install its UI against an
  # isolated runtime without a live SketchUp application.
  class MenuStub
    attr_reader :items

    def initialize
      @items = []
    end

    def add_submenu(_label)
      self
    end

    def add_item(label, &block)
      @items << [label, block]
    end
  end

  # build_test_runtime has no menu, so the shared fields are re-wrapped with one.
  RuntimeStub = Struct.new(:events, :commands, :modules, :module_loader, :capabilities,
                           :smart_objects, :connectors, :levels, :project, :active_model, :menu)

  def isolated_runtime
    base = build_test_runtime
    RuntimeStub.new(*base.to_a, MenuStub.new)
  end

  def roof_definition
    JiraNot::ConstructFlow::Roof::RoofDefinition.new(
      boundary_mm: [[0, 0, 3000], [4000, 0, 3000], [4000, 3000, 3000], [0, 3000, 3000]],
      roof_form: 'lean_to',
      slope_percent: 5,
      low_elevation_mm: 3000
    )
  end

  def wall_object(id: 'wall-1', type: 'architecture.wall', owner: 'constructflow.architecture')
    SmartObjectStub.new(id: id, type: type, owner_module: owner, entity: FakeEntity.new, relationships: [])
  end

  def roof_object(entity:, id: 'cf_roof_1')
    SmartObjectStub.new(
      id: id, entity: entity, owner_module: 'constructflow.roof', type: 'roof.system',
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      relationships: []
    )
  end

  def test_definition_rejects_unsupported_flashing_input
    definition = JiraNot::ConstructFlow::Roof::RoofJunctionDefinition.new(
      roof_object_id: 'cf_roof_1',
      host_object_id: 'wall-1',
      edge_index: 0,
      path_mm: [[0, 0, 3000], [4000, 0, 3000]],
      junction_type: 'roof_to_nothing',
      flashing_profile: 'guesswork',
      material: 'cardboard',
      upstand_mm: 0,
      cover_mm: -10
    )

    refute definition.valid?
    errors = definition.errors
    assert_includes errors, 'unsupported roof junction type'
    assert_includes errors, 'unsupported flashing profile'
    assert_includes errors, 'unsupported roof junction material'
    assert_includes errors, 'roof flashing upstand must be greater than zero'
    assert_includes errors, 'roof flashing cover must be greater than zero'
  end

  def test_definition_requires_two_distinct_path_points
    definition = JiraNot::ConstructFlow::Roof::RoofJunctionDefinition.new(
      roof_object_id: 'cf_roof_1',
      host_object_id: 'wall-1',
      edge_index: 0,
      path_mm: [[1000, 0, 3000], [1000, 0, 3000]]
    )

    refute definition.valid?
    assert_includes definition.errors, 'roof junction path length must be greater than zero'
    assert_in_delta 0.0, definition.length_mm, 0.001
  end

  def test_definition_round_trips_through_hash
    definition = JiraNot::ConstructFlow::Roof::RoofJunctionDefinition.new(
      roof_object_id: 'cf_roof_1',
      host_object_id: 'wall-1',
      edge_index: 2,
      path_mm: [[4000, 3000, 3000], [0, 3000, 3000]],
      flashing_profile: 'counter_flashing',
      material: 'stainless_steel',
      upstand_mm: 200,
      cover_mm: 180
    )

    assert definition.valid?
    restored = JiraNot::ConstructFlow::Roof::RoofJunctionDefinition.from_h(definition.to_h)

    assert_equal definition.to_h, restored.to_h
    assert_equal 2, restored.edge_index
    assert_equal 'counter_flashing', restored.flashing_profile
    assert_in_delta 4000.0, restored.length_mm, 0.001
    assert_equal 200.0, restored.upstand_mm
  end

  def test_stored_path_must_follow_the_addressed_roof_edge
    roof = roof_definition
    edge = roof.edge_points_mm(0)
    aligned = JiraNot::ConstructFlow::Roof::RoofJunctionDefinition.new(
      roof_object_id: 'cf_roof_1', host_object_id: 'wall-1', edge_index: 0, path_mm: edge
    )
    drifted = JiraNot::ConstructFlow::Roof::RoofJunctionDefinition.new(
      roof_object_id: 'cf_roof_1', host_object_id: 'wall-1', edge_index: 0,
      path_mm: [[0, 0, 3000], [3500, 0, 3000]]
    )

    assert aligned.matches_edge?(edge)
    refute drifted.matches_edge?(edge)
    refute aligned.matches_edge?([])
  end

  def test_repository_persists_junction_on_the_roof_object
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Roof::Repository.new
    definition = JiraNot::ConstructFlow::Roof::RoofJunctionDefinition.new(
      roof_object_id: 'cf_roof_1',
      host_object_id: 'wall-1',
      edge_index: 0,
      path_mm: roof_definition.edge_points_mm(0)
    )
    repository.write_roof(entity, roof_definition)
    repository.write_junction(entity, definition)

    restored = repository.read_junction(entity)

    assert_equal definition.to_h, restored.to_h
    assert_equal 'wall-1', restored.host_object_id
    assert_equal roof_definition.to_h, repository.read_roof(entity).to_h
    assert_nil JiraNot::ConstructFlow::Roof::Repository.new.read_junction(FakeEntity.new)
  end

  def test_repository_rejects_a_non_junction_definition
    assert_raises(ArgumentError) do
      JiraNot::ConstructFlow::Roof::Repository.new.write_junction(FakeEntity.new, roof_definition)
    end
  end

  def test_validation_requires_a_wall_host_and_an_in_range_edge
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Roof::Repository.new
    repository.write_roof(entity, roof_definition)
    roof = roof_object(entity: entity)
    column = SmartObjectStub.new(
      id: 'col-1', type: 'structure.column', owner_module: 'constructflow.structure',
      entity: FakeEntity.new, relationships: []
    )
    runtime_without_host = StubRuntime.new(ObjectsStub.new([roof, column]))

    missing_host = JiraNot::ConstructFlow::Roof::Registration.junction_validation_errors(
      { roof_object_id: 'cf_roof_1', host_object_id: 'nope', edge_index: 0 },
      runtime_without_host,
      repository
    )
    assert_includes missing_host, 'roof junction host object not found'

    wrong_host = JiraNot::ConstructFlow::Roof::Registration.junction_validation_errors(
      { roof_object_id: 'cf_roof_1', host_object_id: 'col-1', edge_index: 0 },
      runtime_without_host,
      repository
    )
    assert_includes wrong_host, 'new_roof_to_existing_wall junction requires an architecture wall host'
  end

  def test_command_persists_flashing_replaces_host_link_and_rejects_unknown_edge
    runtime = isolated_runtime
    JiraNot::ConstructFlow::Roof::Registration.install(runtime)
    assert runtime.commands.registered?('SetRoofJunction')

    repository = JiraNot::ConstructFlow::Roof::Repository.new
    roof_entity = FakeEntity.new
    roof_object = runtime.smart_objects.create(
      entity: roof_entity,
      type: 'roof.system',
      owner_module: 'constructflow.roof',
      display_name: 'Junction Test Roof',
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      source_state: 'confirmed'
    )
    repository.write_roof(roof_entity, roof_definition)
    host = runtime.smart_objects.create(
      entity: FakeEntity.new,
      type: 'architecture.wall',
      owner_module: 'constructflow.architecture',
      created_phase: JiraNot::ConstructFlow::Core::Phase::EXISTING,
      source_state: 'confirmed'
    )

    result = runtime.commands.execute(
      'SetRoofJunction',
      { roof_object_id: roof_object.id, host_object_id: host.id, edge_index: 0 },
      project_id: runtime.project.project_id
    )
    assert_equal 'success', result[:status], result[:errors].join(', ')

    junction = repository.read_junction(roof_entity)
    refute_nil junction, 'junction must be persisted on the roof object'
    assert_equal host.id, junction.host_object_id
    assert_equal 150.0, junction.upstand_mm
    assert junction.matches_edge?(repository.read_roof(roof_entity).edge_points_mm(0))
    event_names = result[:events].map { |event| (event[:name] || event['name']).to_s }
    assert_includes event_names, 'RoofJunctionSet'
    assert_includes event_names, 'QuantityDirty'

    re_set = runtime.commands.execute(
      'SetRoofJunction',
      { roof_object_id: roof_object.id, host_object_id: host.id, edge_index: 1, flashing_profile: 'counter_flashing' },
      project_id: runtime.project.project_id
    )
    assert_equal 'success', re_set[:status], re_set[:errors].join(', ')
    refreshed = runtime.smart_objects.fetch_by_id(roof_object.id)
    host_links = refreshed.relationships.count { |relationship| relationship['kind'].to_s == 'host' }
    assert_equal 1, host_links, 're-setting the junction must replace the previous host link'
    assert_equal 'counter_flashing', repository.read_junction(refreshed.entity).flashing_profile

    rejected = runtime.commands.execute(
      'SetRoofJunction',
      { roof_object_id: roof_object.id, host_object_id: host.id, edge_index: 9 },
      project_id: runtime.project.project_id
    )
    assert_equal 'rejected', rejected[:status]
    assert_includes rejected[:errors].join('; '), 'roof edge index out of range'
  end

  def test_validation_accepts_a_wall_host_on_a_real_edge_and_rejects_other_edges
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Roof::Repository.new
    repository.write_roof(entity, roof_definition)
    runtime = StubRuntime.new(ObjectsStub.new([roof_object(entity: entity), wall_object]))

    valid = JiraNot::ConstructFlow::Roof::Registration.junction_validation_errors(
      { roof_object_id: 'cf_roof_1', host_object_id: 'wall-1', edge_index: 1 },
      runtime,
      repository
    )
    assert_empty valid

    out_of_range = JiraNot::ConstructFlow::Roof::Registration.junction_validation_errors(
      { roof_object_id: 'cf_roof_1', host_object_id: 'wall-1', edge_index: 9 },
      runtime,
      repository
    )
    assert_includes out_of_range, 'roof edge index out of range'

    drifted = JiraNot::ConstructFlow::Roof::Registration.junction_validation_errors(
      {
        roof_object_id: 'cf_roof_1', host_object_id: 'wall-1', edge_index: 1,
        path_mm: [[0, 0, 3000], [500, 0, 3000]]
      },
      runtime,
      repository
    )
    assert_includes drifted, 'roof junction path must follow the addressed roof edge'
  end
end
