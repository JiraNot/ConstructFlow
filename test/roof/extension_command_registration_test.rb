# frozen_string_literal: true

require 'minitest/autorun'
require_relative '../../apps/sketchup-extension/constructflow/core/phase'
require_relative '../../apps/sketchup-extension/constructflow/modules/roof/roof_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/roof/extension_command_registration'

class RoofExtensionCommandRegistrationTest < Minitest::Test
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

    def create_roof_group(_model, definition)
      entity = FakeEntity.new("roof-#{created.length + 1}")
      created << [entity, definition]
      entity
    end

    def rebuild_roof!(entity, definition)
      rebuilt << [entity, definition]
      entity
    end
  end

  class FakeRepository
    attr_reader :writes

    def initialize
      @writes = []
    end

    def write_roof(entity, definition)
      writes << [entity, definition]
    end
  end

  class FakeValidator
    def validate_roof(_definition)
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
      'roof_intent' => 'lean_to',
      'config' => {
        'covering_system' => 'metal_sheet',
        'slope_percent' => 5.0,
        'slope_direction_xy' => [0, 1]
      }
    }
  end

  def test_second_generation_rebuilds_same_roof_without_duplicate
    smart_objects = FakeSmartObjects.new
    geometry = FakeGeometry.new
    repository = FakeRepository.new
    runtime = FakeRuntime.new(smart_objects, Object.new, nil)

    first = JiraNot::ConstructFlow::Roof::ExtensionCommandRegistration.generate_or_update(
      runtime: runtime,
      input: { 'extension_id' => 'ext-1', 'intent' => intent },
      repository: repository,
      geometry: geometry,
      validator: FakeValidator.new
    )

    second = JiraNot::ConstructFlow::Roof::ExtensionCommandRegistration.generate_or_update(
      runtime: runtime,
      input: { 'extension_id' => 'ext-1', 'intent' => intent(width_mm: 7000) },
      repository: repository,
      geometry: geometry,
      validator: FakeValidator.new
    )

    assert_equal 1, first[:created_object_ids].length
    assert_empty first[:updated_object_ids]
    assert_empty second[:created_object_ids]
    assert_equal 1, second[:updated_object_ids].length
    assert_equal 1, smart_objects.objects.length
    assert_equal 1, geometry.created.length
    assert_equal 1, geometry.rebuilt.length

    rebuilt_definition = geometry.rebuilt.first[1]
    assert_equal 28_000_000.0, rebuilt_definition.plan_area_mm2
    assert_equal 'ext-1', rebuilt_definition.generated_from_id
  end
end
