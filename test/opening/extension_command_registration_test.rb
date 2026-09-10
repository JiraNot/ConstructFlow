# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/architecture/attachment_edge_resolver')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/opening/extension_command_registration')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/generator')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/orchestrator')

AttachmentOpeningObject = Struct.new(
  :id, :type, :owner_module, :entity, :relationships, :created_phase, :source_state,
  keyword_init: true
)

class AttachmentOpeningSmartObjects
  attr_reader :objects

  def initialize(host)
    @objects = [host]
    @by_entity = { host.entity => host }
    @next_id = 1
  end

  def all = @objects.dup

  def fetch_by_id(id)
    @objects.find { |object| object.id.to_s == id.to_s }
  end

  def create(entity:, type:, owner_module:, created_phase:, source_state:, **_options)
    object = AttachmentOpeningObject.new(
      id: "opening-#{@next_id}", type: type, owner_module: owner_module, entity: entity,
      relationships: [], created_phase: created_phase, source_state: source_state
    )
    @next_id += 1
    @objects << object
    @by_entity[entity] = object
    object
  end

  def add_relationship(entity, kind:, target_id:, role: nil, metadata: {})
    object = @by_entity.fetch(entity)
    object.relationships << {
      'kind' => kind.to_s, 'target_id' => target_id.to_s, 'role' => role&.to_s, 'metadata' => metadata
    }
  end

  def remove_relationship(entity, kind: nil, target_id: nil, **_options)
    object = @by_entity.fetch(entity)
    before = object.relationships.length
    object.relationships.reject! do |relationship|
      (kind.nil? || relationship['kind'] == kind.to_s) &&
        (target_id.nil? || relationship['target_id'] == target_id.to_s)
    end
    before - object.relationships.length
  end

  def mark_dirty(_entity, *_flags) = true

  def erase!(entity)
    object = @by_entity.delete(entity)
    raise KeyError, 'opening not found' unless object
    @objects.delete(object)
    object
  end
end

class AttachmentOpeningHostCapability
  attr_reader :attached, :updated, :detached

  def initialize
    @attached = []
    @updated = []
    @detached = []
  end

  def compatible_host?(object)
    object && object.type == 'architecture.wall'
  end

  def locate(_host, _point)
    { segment_index: 0, distance_along_mm: 2000.0 }
  end

  def attach_opening(host, opening_id:, descriptor:)
    @attached << [host.id, opening_id, descriptor]
    descriptor
  end

  def update_opening(host, opening_id:, descriptor:)
    @updated << [host.id, opening_id, descriptor]
    descriptor
  end

  def detach_opening(host, opening_id:)
    @detached << [host.id, opening_id]
    true
  end
end

class AttachmentOpeningGeometry
  attr_reader :created, :rebuilt

  def initialize
    @created = []
    @rebuilt = []
  end

  def create_group(_model, host_object:, definition:, host_capability:)
    entity = FakeEntity.new
    @created << [entity, host_object, definition, host_capability]
    entity
  end

  def rebuild!(entity, host_object:, definition:, host_capability:)
    @rebuilt << [entity, host_object, definition, host_capability]
    entity
  end
end

class AttachmentOpeningValidator
  def validate(_definition, host_object:) = []
end

AttachmentResolution = Struct.new(:host_object_id, :edge_index, keyword_init: true)

class AttachmentOpeningResolver
  def resolve(**_options)
    AttachmentResolution.new(host_object_id: 'host-1', edge_index: 0)
  end
end

AttachmentOpeningRuntime = Struct.new(:smart_objects, :active_model)

class OpeningExtensionCommandRegistrationTest < Minitest::Test
  def setup
    @host = AttachmentOpeningObject.new(
      id: 'host-1', type: 'architecture.wall', owner_module: 'constructflow.architecture',
      entity: FakeEntity.new, relationships: [], created_phase: JiraNot::ConstructFlow::Core::Phase::EXISTING,
      source_state: 'measured'
    )
    @smart_objects = AttachmentOpeningSmartObjects.new(@host)
    @runtime = AttachmentOpeningRuntime.new(@smart_objects, Object.new)
    @repository = JiraNot::ConstructFlow::Opening::OpeningRepository.new
    @geometry = AttachmentOpeningGeometry.new
    @host_capability = AttachmentOpeningHostCapability.new
    @validator = AttachmentOpeningValidator.new
    @resolver = AttachmentOpeningResolver.new
  end

  def intent(config)
    {
      'extension_id' => 'ext-1',
      'attachment_host_id' => 'host-1',
      'boundary_mm' => [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]],
      'config' => config
    }
  end

  def generate(config)
    JiraNot::ConstructFlow::Opening::ExtensionCommandRegistration.generate_or_update(
      runtime: @runtime,
      input: { 'extension_id' => 'ext-1', 'intent' => intent(config) },
      repository: @repository,
      geometry: @geometry,
      host_capability: @host_capability,
      validator: @validator,
      resolver: @resolver
    )
  end

  def test_enabled_attachment_opening_requires_explicit_host_modification_confirmation
    error = assert_raises(ArgumentError) do
      generate('enabled' => true, 'width_mm' => 900, 'height_mm' => 2100)
    end

    assert_includes error.message, 'confirm_modify_existing_host'
    assert_equal 1, @smart_objects.objects.length
  end

  def test_create_update_and_disable_converge_one_generated_attachment_opening
    first = generate(
      'enabled' => true,
      'confirm_modify_existing_host' => true,
      'width_mm' => 900,
      'height_mm' => 2100,
      'sill_mm' => 0
    )

    assert_equal 1, first[:created_object_ids].length
    opening = @smart_objects.objects.find { |object| object.type == 'opening.rectangular' }
    refute_nil opening
    definition = @repository.read(opening.entity)
    assert_equal 'host-1', definition.host_object_id
    assert_in_delta 1550.0, definition.start_offset_mm, 0.001
    assert_equal 1, @host_capability.attached.length
    assert opening.relationships.any? { |relationship| relationship['kind'] == 'generated_from' && relationship['target_id'] == 'ext-1' }

    second = generate(
      'enabled' => true,
      'confirm_modify_existing_host' => true,
      'width_mm' => 1000,
      'height_mm' => 2200,
      'sill_mm' => 0
    )

    assert_empty second[:created_object_ids]
    assert_equal opening.id, second[:updated_object_ids].first
    assert_equal 1, @smart_objects.objects.count { |object| object.type == 'opening.rectangular' }
    assert_equal 1, @host_capability.updated.length
    updated = @repository.read(opening.entity)
    assert_in_delta 1500.0, updated.start_offset_mm, 0.001
    assert_equal 1000.0, updated.width_mm
    assert_equal 2200.0, updated.height_mm

    third = generate('enabled' => false)

    assert_equal [opening.id], third[:removed_object_ids]
    assert_equal [['host-1', opening.id]], @host_capability.detached
    assert_nil @smart_objects.fetch_by_id(opening.id)
  end

  def test_opening_intent_is_opt_in_and_default_orchestration_does_not_add_opening_step
    definition = JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
      boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]],
      program: 'kitchen', mode: 'construction', attachment_host_id: 'host-1'
    )
    generator = JiraNot::ConstructFlow::Extension::Generator.new(definition)
    default_plan = JiraNot::ConstructFlow::Extension::Orchestrator.new(generator).plan('extension_id' => 'ext-1')
    refute_includes default_plan['steps'].map { |step| step['domain'] }, 'opening'

    explicit = JiraNot::ConstructFlow::Extension::Orchestrator.new(generator).plan(
      'extension_id' => 'ext-1',
      'domains' => {
        'opening' => {
          'enabled' => true,
          'confirm_modify_existing_host' => true,
          'width_mm' => 900,
          'height_mm' => 2100
        }
      }
    )
    opening_step = explicit['steps'].find { |step| step['domain'] == 'opening' }
    refute_nil opening_step
    assert_equal ['architecture'], opening_step['dependencies']
  end
end
