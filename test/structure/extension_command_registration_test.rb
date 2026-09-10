# frozen_string_literal: true

require 'minitest/autorun'
require_relative '../../apps/sketchup-extension/constructflow/core/phase'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/column_definition'
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
    attr_reader :created, :rebuilt

    def initialize
      @created = []
      @rebuilt = []
    end

    def create_column_group(_model, definition)
      entity = FakeEntity.new("column-#{created.length + 1}")
      created << [entity, definition]
      entity
    end

    def rebuild_column!(entity, definition)
      rebuilt << [entity, definition]
      entity
    end
  end

  class FakeRepository
    attr_reader :writes

    def initialize
      @writes = []
    end

    def write_column(entity, definition)
      writes << [entity, definition]
    end
  end

  class FakeValidator
    def validate_column(_definition)
      []
    end
  end

  FakeRuntime = Struct.new(:smart_objects, :active_model, :levels)

  def intent(width_mm: 6000, boundary_mm: nil)
    {
      'extension_id' => 'ext-1',
      'boundary_mm' => boundary_mm || [
        [0, 0, 0], [width_mm, 0, 0], [width_mm, 4000, 0], [0, 4000, 0]
      ],
      'base_offset_mm' => 0,
      'target_height_mm' => 3000,
      'config' => { 'column_section_mm' => [200, 200] }
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

  def test_second_generation_updates_same_objects_without_duplicates
    smart_objects = FakeSmartObjects.new
    geometry = FakeGeometry.new
    repository = FakeRepository.new
    runtime = FakeRuntime.new(smart_objects, Object.new, nil)

    first = generate(runtime: runtime, geometry: geometry, repository: repository, intent_value: intent)
    second = generate(runtime: runtime, geometry: geometry, repository: repository, intent_value: intent(width_mm: 7000))

    assert_equal 4, first[:created_object_ids].length
    assert_empty first[:updated_object_ids]
    assert_empty first[:removed_object_ids]
    assert_empty second[:created_object_ids]
    assert_equal 4, second[:updated_object_ids].length
    assert_empty second[:removed_object_ids]
    assert_equal 4, smart_objects.objects.length
    assert_equal 4, geometry.created.length
    assert_equal 4, geometry.rebuilt.length

    rebuilt_corner = geometry.rebuilt[1][1]
    assert_equal 7000.0, rebuilt_corner.location_mm[0]
  end

  def test_regeneration_erases_generated_column_whose_slot_is_no_longer_in_source_boundary
    smart_objects = FakeSmartObjects.new
    geometry = FakeGeometry.new
    repository = FakeRepository.new
    runtime = FakeRuntime.new(smart_objects, Object.new, nil)

    first = generate(runtime: runtime, geometry: geometry, repository: repository, intent_value: intent)
    stale_id = first[:created_object_ids].last
    stale_entity = smart_objects.objects.last.entity
    triangular = [[0, 0, 0], [6000, 0, 0], [0, 4000, 0]]

    second = generate(
      runtime: runtime,
      geometry: geometry,
      repository: repository,
      intent_value: intent(boundary_mm: triangular)
    )

    assert_equal [stale_id], second[:removed_object_ids]
    assert stale_entity.erased
    assert_equal 3, smart_objects.objects.length
    assert_equal 3, second[:updated_object_ids].length
    assert second[:events].any? do |event|
      event[:name] == 'GeometryChanged' && event[:object_ids] == [stale_id] && event.dig(:payload, :removed) == true
    end
  end
end
