# frozen_string_literal: true

require 'minitest/autorun'
require_relative '../../apps/sketchup-extension/constructflow/core/phase'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/column_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/foundation_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/extension_command_registration'

class StructureExtensionCommandRegistrationTest < Minitest::Test
  FakeEntity = Struct.new(:name) do
    attr_reader :erased

    def erase!
      @erased = true
      true
    end
  end
  FakeObject = Struct.new(:id, :type, :entity, :relationships)

  class FakeSmartObjects
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

    def create(entity:, type:, **_options)
      object = FakeObject.new("obj-#{@next_id}", type, entity, [])
      @next_id += 1
      objects << object
      @by_entity[entity] = object
      object
    end

    def add_relationship(entity, kind:, target_id:, role:, metadata: {})
      @by_entity.fetch(entity).relationships << {
        'kind' => kind,
        'target_id' => target_id,
        'role' => role,
        'metadata' => metadata
      }
    end

    def remove_relationship(entity, kind: nil, target_id: nil, **_options)
      object = @by_entity.fetch(entity)
      before = object.relationships.length
      object.relationships.reject! do |relationship|
        kind_match = kind.nil? || relationship['kind'].to_s == kind.to_s
        target_match = target_id.nil? || relationship['target_id'].to_s == target_id.to_s
        kind_match && target_match
      end
      before - object.relationships.length
    end

    def mark_dirty(_entity, *_flags)
      true
    end

    def erase!(entity)
      object = @by_entity.delete(entity)
      raise KeyError, 'unknown fake object' unless object

      entity.erase!
      objects.delete(object)
      object
    end
  end

  class FakeGeometry
    attr_reader :created_columns, :rebuilt_columns, :created_foundations, :rebuilt_foundations

    def initialize
      @created_columns = []
      @rebuilt_columns = []
      @created_foundations = []
      @rebuilt_foundations = []
    end

    def create_column_group(_model, definition)
      entity = FakeEntity.new("column-#{created_columns.length + 1}")
      created_columns << [entity, definition]
      entity
    end

    def rebuild_column!(entity, definition)
      rebuilt_columns << [entity, definition]
      entity
    end

    def create_foundation_group(_model, definition)
      entity = FakeEntity.new("foundation-#{created_foundations.length + 1}")
      created_foundations << [entity, definition]
      entity
    end

    def rebuild_foundation!(entity, definition)
      rebuilt_foundations << [entity, definition]
      entity
    end
  end

  class FakeRepository
    attr_reader :column_writes, :foundation_writes

    def initialize
      @column_writes = []
      @foundation_writes = []
      @foundations = {}
    end

    def write_column(entity, definition)
      column_writes << [entity, definition]
      definition
    end

    def write_foundation(entity, definition)
      foundation_writes << [entity, definition]
      @foundations[entity] = definition
      definition
    end

    def read_foundation(entity)
      @foundations[entity]
    end
  end

  class FakeValidator
    def validate_column(_definition)
      []
    end

    def validate_foundation(_definition)
      []
    end
  end

  FakeRuntime = Struct.new(:smart_objects, :active_model, :levels)

  def intent(width_mm: 6000, boundary_mm: nil, config: {})
    {
      'extension_id' => 'ext-1',
      'boundary_mm' => boundary_mm || [
        [0, 0, 0], [width_mm, 0, 0], [width_mm, 4000, 0], [0, 4000, 0]
      ],
      'base_offset_mm' => 0,
      'target_height_mm' => 3000,
      'config' => { 'column_section_mm' => [200, 200], 'foundation' => 'auto' }.merge(config)
    }
  end

  def generate(runtime:, geometry:, repository:, intent_value:)
    JiraNot::ConstructFlow::Structure::ExtensionCommandRegistration.generate_or_update(
      runtime: runtime,
      input: { 'extension_id' => 'ext-1', 'intent' => intent_value },
      repository: repository,
      geometry: geometry,
      validator: FakeValidator.new
    )
  end

  def test_first_generation_creates_columns_and_one_foundation_per_column
    smart_objects = FakeSmartObjects.new
    geometry = FakeGeometry.new
    repository = FakeRepository.new
    runtime = FakeRuntime.new(smart_objects, Object.new, nil)

    result = generate(runtime: runtime, geometry: geometry, repository: repository, intent_value: intent)

    assert_equal 8, result[:created_object_ids].length
    assert_empty result[:updated_object_ids]
    assert_empty result[:removed_object_ids]
    assert_equal 4, smart_objects.objects.count { |object| object.type == 'structure.column' }
    assert_equal 4, smart_objects.objects.count { |object| object.type == 'structure.foundation' }
    assert_equal 4, geometry.created_columns.length
    assert_equal 4, geometry.created_foundations.length

    foundation = smart_objects.objects.find { |object| object.type == 'structure.foundation' }
    definition = repository.read_foundation(foundation.entity)
    refute_nil definition.supported_object_id
    assert foundation.relationships.any? { |relationship| relationship['kind'] == 'supports' }
  end

  def test_second_generation_updates_same_columns_and_foundations_without_duplicates
    smart_objects = FakeSmartObjects.new
    geometry = FakeGeometry.new
    repository = FakeRepository.new
    runtime = FakeRuntime.new(smart_objects, Object.new, nil)

    first = generate(runtime: runtime, geometry: geometry, repository: repository, intent_value: intent)
    second = generate(runtime: runtime, geometry: geometry, repository: repository, intent_value: intent(width_mm: 7000))

    assert_equal 8, first[:created_object_ids].length
    assert_empty second[:created_object_ids]
    assert_equal 8, second[:updated_object_ids].length
    assert_empty second[:removed_object_ids]
    assert_equal 8, smart_objects.objects.length
    assert_equal 4, geometry.created_columns.length
    assert_equal 4, geometry.created_foundations.length
    assert_equal 4, geometry.rebuilt_columns.length
    assert_equal 4, geometry.rebuilt_foundations.length

    rebuilt_corner = geometry.rebuilt_columns[1][1]
    assert_equal 7000.0, rebuilt_corner.location_mm[0]
    rebuilt_foundation = geometry.rebuilt_foundations[1][1]
    assert_equal 7000.0, rebuilt_foundation.center_mm[0]
  end

  def test_topology_shrink_erases_stale_column_and_its_foundation
    smart_objects = FakeSmartObjects.new
    geometry = FakeGeometry.new
    repository = FakeRepository.new
    runtime = FakeRuntime.new(smart_objects, Object.new, nil)

    first = generate(runtime: runtime, geometry: geometry, repository: repository, intent_value: intent)
    stale_column = smart_objects.objects.find do |object|
      object.type == 'structure.column' && object.relationships.any? { |relationship| relationship.dig('metadata', 'slot') == 'corner_3' }
    end
    stale_foundation = smart_objects.objects.find do |object|
      object.type == 'structure.foundation' && object.relationships.any? { |relationship| relationship.dig('metadata', 'slot') == 'foundation_corner_3' }
    end
    triangular = [[0, 0, 0], [6000, 0, 0], [0, 4000, 0]]

    second = generate(
      runtime: runtime,
      geometry: geometry,
      repository: repository,
      intent_value: intent(boundary_mm: triangular)
    )

    assert_includes second[:removed_object_ids], stale_column.id
    assert_includes second[:removed_object_ids], stale_foundation.id
    assert stale_column.entity.erased
    assert stale_foundation.entity.erased
    assert_equal 6, smart_objects.objects.length
    assert_equal 6, second[:updated_object_ids].length
    refute_includes first[:removed_object_ids], stale_column.id
  end

  def test_foundation_can_be_disabled_and_prior_generated_foundations_are_reconciled_away
    smart_objects = FakeSmartObjects.new
    geometry = FakeGeometry.new
    repository = FakeRepository.new
    runtime = FakeRuntime.new(smart_objects, Object.new, nil)

    first = generate(runtime: runtime, geometry: geometry, repository: repository, intent_value: intent)
    foundation_ids = smart_objects.objects.select { |object| object.type == 'structure.foundation' }.map(&:id)
    second = generate(
      runtime: runtime,
      geometry: geometry,
      repository: repository,
      intent_value: intent(config: { 'foundation' => false })
    )

    assert_equal foundation_ids.sort, second[:removed_object_ids].sort
    assert_equal 4, smart_objects.objects.length
    assert smart_objects.objects.all? { |object| object.type == 'structure.column' }
    assert_equal 4, second[:updated_object_ids].length
    assert_empty first[:removed_object_ids]
  end

  def test_foundation_type_and_size_are_configurable_without_changing_identity
    smart_objects = FakeSmartObjects.new
    geometry = FakeGeometry.new
    repository = FakeRepository.new
    runtime = FakeRuntime.new(smart_objects, Object.new, nil)

    first = generate(runtime: runtime, geometry: geometry, repository: repository, intent_value: intent)
    foundation_ids = smart_objects.objects.select { |object| object.type == 'structure.foundation' }.map(&:id).sort
    second = generate(
      runtime: runtime,
      geometry: geometry,
      repository: repository,
      intent_value: intent(config: {
        'foundation' => 'pile_cap',
        'foundation_size_mm' => [1200, 1200, 450]
      })
    )

    assert_empty second[:created_object_ids]
    assert_empty second[:removed_object_ids]
    assert_equal foundation_ids, smart_objects.objects.select { |object| object.type == 'structure.foundation' }.map(&:id).sort
    latest = geometry.rebuilt_foundations.last[1]
    assert_equal 'pile_cap', latest.foundation_type
    assert_equal [1200.0, 1200.0, 450.0], latest.size_mm
  end
end
