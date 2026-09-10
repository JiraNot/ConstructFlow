# frozen_string_literal: true

require 'minitest/autorun'
require_relative '../../apps/sketchup-extension/constructflow/core/phase'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/column_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/extension_command_registration'

class StructureExtensionCommandRegistrationTest < Minitest::Test
  FakeEntity = Struct.new(:name)
  FakeObject = Struct.new(:id, :type, :entity, :relationships)

  class FakeSmartObjects
    attr_reader :objects

    def initialize
      @objects = []
      @by_entity = {}
    end

    def all
      objects
    end

    def create(entity:, type:, **_options)
      object = FakeObject.new("obj-#{objects.length + 1}", type, entity, [])
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

  def intent(width_mm: 6000)
    {
      'extension_id' => 'ext-1',
      'boundary_mm' => [
        [0, 0, 0], [width_mm, 0, 0], [width_mm, 4000, 0], [0, 4000, 0]
      ],
      'base_offset_mm' => 0,
      'target_height_mm' => 3000,
      'config' => { 'column_section_mm' => [200, 200] }
    }
  end

  def test_second_generation_updates_same_objects_without_duplicates
    smart_objects = FakeSmartObjects.new
    geometry = FakeGeometry.new
    repository = FakeRepository.new
    runtime = FakeRuntime.new(smart_objects, Object.new, nil)

    first = JiraNot::ConstructFlow::Structure::ExtensionCommandRegistration.generate_or_update(
      runtime: runtime,
      input: { 'extension_id' => 'ext-1', 'intent' => intent },
      repository: repository,
      geometry: geometry,
      validator: FakeValidator.new
    )

    second = JiraNot::ConstructFlow::Structure::ExtensionCommandRegistration.generate_or_update(
      runtime: runtime,
      input: { 'extension_id' => 'ext-1', 'intent' => intent(width_mm: 7000) },
      repository: repository,
      geometry: geometry,
      validator: FakeValidator.new
    )

    assert_equal 4, first[:created_object_ids].length
    assert_empty first[:updated_object_ids]
    assert_empty second[:created_object_ids]
    assert_equal 4, second[:updated_object_ids].length
    assert_equal 4, smart_objects.objects.length
    assert_equal 4, geometry.created.length
    assert_equal 4, geometry.rebuilt.length

    rebuilt_corner = geometry.rebuilt[1][1]
    assert_equal 7000.0, rebuilt_corner.location_mm[0]
  end
end
