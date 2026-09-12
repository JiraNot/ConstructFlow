# frozen_string_literal: true

require 'minitest/autorun'
require_relative '../../apps/sketchup-extension/constructflow/core/phase'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/wall_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/attachment_edge_resolver'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/extension_command_registration'

class ArchitectureExtensionCommandRegistrationTest < Minitest::Test
  ArchitectureExtensionEntity = Struct.new(:name) do
    attr_reader :erased

    def erase!
      @erased = true
      true
    end
  end

  ArchitectureExtensionObject = Struct.new(
    :id, :type, :owner_module, :entity, :relationships, :source_state, :level_refs,
    keyword_init: true
  )

  class ArchitectureExtensionSmartObjects
    attr_reader :objects

    def initialize
      @objects = []
      @by_entity = {}
      @next_id = 1
    end

    def all
      objects
    end

    def fetch_by_id(id)
      objects.find { |object| object.id.to_s == id.to_s }
    end

    def seed(object)
      objects << object
      @by_entity[object.entity] = object
      object
    end

    def create(entity:, type:, owner_module:, source_state:, level_refs: [], **_options)
      object = ArchitectureExtensionObject.new(
        id: "wall-#{@next_id}",
        type: type,
        owner_module: owner_module,
        entity: entity,
        relationships: [],
        source_state: source_state,
        level_refs: Array(level_refs)
      )
      @next_id += 1
      seed(object)
    end

    def add_relationship(entity, kind:, target_id:, role:, metadata: {})
      @by_entity.fetch(entity).relationships << {
        'kind' => kind,
        'target_id' => target_id,
        'role' => role,
        'metadata' => metadata
      }
    end

    def update_level_refs(entity, values)
      @by_entity.fetch(entity).level_refs = Array(values)
      @by_entity[entity]
    end

    def mark_dirty(_entity, *_flags)
      true
    end

    def mark_dirty_with_dependents(entity, *flags)
      mark_dirty(entity, *flags)
      [@by_entity.fetch(entity).id]
    end

    def erase!(entity)
      object = @by_entity.delete(entity)
      raise KeyError, 'unknown fake wall' unless object

      entity.erase!
      objects.delete(object)
      object
    end
  end

  class ArchitectureExtensionGeometry
    attr_reader :created, :rebuilt

    def initialize
      @created = []
      @rebuilt = []
    end

    def create_group(_model, definition)
      entity = ArchitectureExtensionEntity.new("wall-entity-#{created.length + 1}")
      created << [entity, definition]
      entity
    end

    def rebuild!(entity, definition, openings: [])
      rebuilt << [entity, definition, openings]
      entity
    end
  end

  class ArchitectureExtensionRepository
    attr_reader :writes

    def initialize
      @writes = []
      @definitions = {}
      @openings = Hash.new { |hash, key| hash[key] = [] }
    end

    def write(entity, definition)
      writes << [entity, definition]
      @definitions[entity] = definition
      definition
    end

    def read(entity)
      @definitions[entity]
    end

    def host_openings(entity)
      @openings[entity]
    end

    def set_openings(entity, values)
      @openings[entity] = values
    end
  end

  class ArchitectureExtensionValidator
    def validate(definition)
      definition.errors.map { |message| { severity: 'error', message: message } }
    end
  end

  class ArchitectureExtensionLevels
    def fetch(id)
      values = { 'ffl-a' => 100.0, 'ffl-b' => 250.0 }
      Struct.new(:elevation_mm).new(values.fetch(id.to_s))
    end
  end

  ArchitectureExtensionRuntime = Struct.new(:smart_objects, :active_model, :levels)

  def rectangle(width: 6000, depth: 4000, closed: false)
    points = [[0, 0, 0], [width, 0, 0], [width, depth, 0], [0, depth, 0]]
    points << [0, 0, 0] if closed
    points
  end

  def intent(boundary: rectangle, config: {}, base_level_id: nil, base_offset_mm: 0, attachment_host_id: nil)
    {
      'extension_id' => 'ext-1',
      'boundary_mm' => boundary,
      'base_level_id' => base_level_id,
      'base_offset_mm' => base_offset_mm,
      'target_height_mm' => 3000,
      'attachment_host_id' => attachment_host_id,
      'config' => config
    }
  end

  def generate(runtime:, geometry:, repository:, intent_value:)
    JiraNot::ConstructFlow::Architecture::ExtensionCommandRegistration.generate_or_update(
      runtime: runtime,
      input: { 'extension_id' => 'ext-1', 'intent' => intent_value },
      repository: repository,
      geometry: geometry,
      validator: ArchitectureExtensionValidator.new
    )
  end

  def add_host_wall(smart_objects:, repository:, id: 'host-wall', path: [[0, 0, 0], [6000, 0, 0]])
    entity = ArchitectureExtensionEntity.new("#{id}-entity")
    object = ArchitectureExtensionObject.new(
      id: id,
      type: 'architecture.wall',
      owner_module: 'constructflow.architecture',
      entity: entity,
      relationships: [],
      source_state: 'measured',
      level_refs: []
    )
    smart_objects.seed(object)
    repository.write(entity, JiraNot::ConstructFlow::Architecture::WallDefinition.new(path_mm: path))
    object
  end

  def generated_walls(smart_objects)
    smart_objects.objects.select do |object|
      object.relationships.any? do |relationship|
        relationship['kind'] == 'generated_from' && relationship['target_id'] == 'ext-1'
      end
    end
  end

  def generated_slots(smart_objects)
    generated_walls(smart_objects).map do |object|
      object.relationships.find { |relationship| relationship['kind'] == 'generated_from' }.dig('metadata', 'slot')
    end.sort
  end

  def test_first_generation_creates_one_wall_per_boundary_edge
    smart_objects = ArchitectureExtensionSmartObjects.new
    geometry = ArchitectureExtensionGeometry.new
    repository = ArchitectureExtensionRepository.new
    runtime = ArchitectureExtensionRuntime.new(smart_objects, Object.new, nil)

    result = generate(runtime: runtime, geometry: geometry, repository: repository, intent_value: intent(boundary: rectangle(closed: true)))

    assert_equal 4, result[:created_object_ids].length
    assert_empty result[:updated_object_ids]
    assert_empty result[:removed_object_ids]
    assert_equal 4, smart_objects.objects.length
    assert_equal 4, geometry.created.length
    assert smart_objects.objects.all? { |object| object.type == 'architecture.wall' }
    assert smart_objects.objects.all? { |object| object.owner_module == 'constructflow.architecture' }
    assert smart_objects.objects.all? { |object| object.source_state == 'assumed' }
    assert_equal 1, result[:warnings].length
  end

  def test_attachment_host_suppresses_matching_extension_edge
    smart_objects = ArchitectureExtensionSmartObjects.new
    geometry = ArchitectureExtensionGeometry.new
    repository = ArchitectureExtensionRepository.new
    host = add_host_wall(smart_objects: smart_objects, repository: repository)
    runtime = ArchitectureExtensionRuntime.new(smart_objects, Object.new, nil)

    result = generate(
      runtime: runtime,
      geometry: geometry,
      repository: repository,
      intent_value: intent(attachment_host_id: host.id)
    )

    assert_equal 3, result[:created_object_ids].length
    assert_equal 3, generated_walls(smart_objects).length
    assert_equal %w[wall_edge_1 wall_edge_2 wall_edge_3], generated_slots(smart_objects)
    assert_equal 0, result.dig(:attachment, 'edge_index')
    assert_equal 'geometry_match', result.dig(:attachment, 'resolution')
    refute host.entity.erased
  end

  def test_adding_attachment_reconciles_previously_generated_overlap_wall
    smart_objects = ArchitectureExtensionSmartObjects.new
    geometry = ArchitectureExtensionGeometry.new
    repository = ArchitectureExtensionRepository.new
    runtime = ArchitectureExtensionRuntime.new(smart_objects, Object.new, nil)

    generate(runtime: runtime, geometry: geometry, repository: repository, intent_value: intent)
    prior_overlap = generated_walls(smart_objects).find do |object|
      object.relationships.any? { |relationship| relationship.dig('metadata', 'slot') == 'wall_edge_0' }
    end
    host = add_host_wall(smart_objects: smart_objects, repository: repository)

    result = generate(
      runtime: runtime,
      geometry: geometry,
      repository: repository,
      intent_value: intent(attachment_host_id: host.id)
    )

    assert_includes result[:removed_object_ids], prior_overlap.id
    assert prior_overlap.entity.erased
    assert_equal %w[wall_edge_1 wall_edge_2 wall_edge_3], generated_slots(smart_objects)
    assert_equal 3, result[:updated_object_ids].length
  end

  def test_regeneration_preserves_identity_hosted_openings_and_updates_level_refs
    smart_objects = ArchitectureExtensionSmartObjects.new
    geometry = ArchitectureExtensionGeometry.new
    repository = ArchitectureExtensionRepository.new
    runtime = ArchitectureExtensionRuntime.new(smart_objects, Object.new, ArchitectureExtensionLevels.new)

    first = generate(
      runtime: runtime,
      geometry: geometry,
      repository: repository,
      intent_value: intent(base_level_id: 'ffl-a', base_offset_mm: 25)
    )
    ids = smart_objects.objects.map(&:id)
    first_wall = smart_objects.objects.first
    openings = [{ 'segment_index' => 0, 'start_offset_mm' => 500, 'width_mm' => 900, 'height_mm' => 2100, 'sill_mm' => 0 }]
    repository.set_openings(first_wall.entity, openings)

    second = generate(
      runtime: runtime,
      geometry: geometry,
      repository: repository,
      intent_value: intent(boundary: rectangle(width: 7000), base_level_id: 'ffl-b', base_offset_mm: 50)
    )

    assert_equal 4, first[:created_object_ids].length
    assert_empty second[:created_object_ids]
    assert_equal 4, second[:updated_object_ids].length
    assert_empty second[:removed_object_ids]
    assert_equal ids, smart_objects.objects.map(&:id)
    assert_equal openings, geometry.rebuilt.find { |entry| entry[0].equal?(first_wall.entity) }[2]
    assert_equal 7000.0, geometry.rebuilt[0][1].path_mm[1][0]
    assert_equal 300.0, geometry.rebuilt[0][1].path_mm[0][2]
    assert_equal 'ffl-b', first_wall.level_refs.first[:level_id]
    assert_equal 50.0, first_wall.level_refs.first[:offset_mm]
  end

  def test_topology_shrink_reconciles_stale_generated_wall
    smart_objects = ArchitectureExtensionSmartObjects.new
    geometry = ArchitectureExtensionGeometry.new
    repository = ArchitectureExtensionRepository.new
    runtime = ArchitectureExtensionRuntime.new(smart_objects, Object.new, nil)

    generate(runtime: runtime, geometry: geometry, repository: repository, intent_value: intent)
    stale = smart_objects.objects.find do |object|
      object.relationships.any? { |relationship| relationship.dig('metadata', 'slot') == 'wall_edge_3' }
    end

    result = generate(
      runtime: runtime,
      geometry: geometry,
      repository: repository,
      intent_value: intent(boundary: [[0, 0, 0], [6000, 0, 0], [0, 4000, 0]])
    )

    assert_equal 3, smart_objects.objects.length
    assert_includes result[:removed_object_ids], stale.id
    assert stale.entity.erased
    assert_equal 3, result[:updated_object_ids].length
  end

  def test_explicit_wall_type_and_thickness_are_confirmed
    smart_objects = ArchitectureExtensionSmartObjects.new
    geometry = ArchitectureExtensionGeometry.new
    repository = ArchitectureExtensionRepository.new
    runtime = ArchitectureExtensionRuntime.new(smart_objects, Object.new, nil)

    result = generate(
      runtime: runtime,
      geometry: geometry,
      repository: repository,
      intent_value: intent(config: {
        'wall_type_id' => 'company.wall.aac.100',
        'wall_thickness_mm' => 100,
        'wall_height_mm' => 3200
      })
    )

    assert_empty result[:warnings]
    assert smart_objects.objects.all? { |object| object.source_state == 'confirmed' }
    definition = geometry.created.first[1]
    assert_equal 'company.wall.aac.100', definition.wall_type_id
    assert_equal 100.0, definition.thickness_mm
    assert_equal 3200.0, definition.height_mm
  end
end
