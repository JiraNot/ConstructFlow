# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/door_window/extension_command_registration')

ExtensionInfillObject = Struct.new(
  :id, :type, :owner_module, :entity, :relationships, :source_state,
  :created_phase, :removed_phase,
  keyword_init: true
)

class ExtensionInfillEntity < FakeAttributeCarrier
  attr_reader :erased

  def erase!
    @erased = true
    true
  end
end

class ExtensionInfillSmartObjects
  attr_reader :objects

  def initialize(objects = [])
    @objects = objects
    @by_entity = {}
    @next_id = 1
    objects.each { |object| @by_entity[object.entity] = object }
  end

  def all = objects.dup

  def fetch_by_id(id)
    objects.find { |object| object.id.to_s == id.to_s }
  end

  def create(entity:, type:, owner_module:, source_state:, created_phase:, **_options)
    object = ExtensionInfillObject.new(
      id: "dw-#{@next_id}",
      type: type,
      owner_module: owner_module,
      entity: entity,
      relationships: [],
      source_state: source_state,
      created_phase: created_phase,
      removed_phase: nil
    )
    @next_id += 1
    objects << object
    @by_entity[entity] = object
    object
  end

  def add_relationship(entity, kind:, target_id:, role: nil, metadata: {})
    @by_entity.fetch(entity).relationships << {
      'kind' => kind.to_s,
      'target_id' => target_id.to_s,
      'role' => role&.to_s,
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

  def mark_dirty(_entity, *_flags) = true

  def erase!(entity)
    object = @by_entity.delete(entity)
    raise KeyError, 'unknown extension infill object' unless object

    entity.erase!
    objects.delete(object)
    object
  end
end

class ExtensionInfillOpeningHost
  attr_reader :refs

  def initialize(width_mm: 1000, height_mm: 2100)
    @width_mm = width_mm
    @height_mm = height_mm
    @refs = {}
  end

  def compatible_host?(object)
    object && object.owner_module.to_s == 'constructflow.opening' && object.type.to_s.start_with?('opening.')
  end

  def dimensions(_opening)
    { width_mm: @width_mm, height_mm: @height_mm, sill_mm: 0, shape: 'rectangular' }
  end

  def validate_infill(opening, infill_id:, width_mm:, height_mm:, **_options)
    return ['infill dimensions require opening resize'] unless Float(width_mm) == @width_mm && Float(height_mm) == @height_mm

    current = refs[opening.id]
    return ['opening already has an infill'] if current && current['infill_id'].to_s != infill_id.to_s
    []
  end

  def attach_infill(opening, infill_id:, infill_type:, width_mm:, height_mm:, **_options)
    errors = validate_infill(opening, infill_id: infill_id, width_mm: width_mm, height_mm: height_mm)
    raise ArgumentError, errors.join('; ') unless errors.empty?

    refs[opening.id] = {
      'infill_id' => infill_id.to_s,
      'infill_type' => infill_type.to_s,
      'width_mm' => Float(width_mm),
      'height_mm' => Float(height_mm)
    }
  end

  def detach_infill(opening, infill_id: nil)
    current = refs[opening.id]
    return false unless current
    return false if infill_id && current['infill_id'].to_s != infill_id.to_s

    refs.delete(opening.id)
    true
  end
end

class ExtensionInfillGeometry
  attr_reader :created, :rebuilt

  def initialize
    @created = []
    @rebuilt = []
  end

  def create_group(_model, opening_object:, type:, opening_host_capability:)
    entity = ExtensionInfillEntity.new
    created << [entity, opening_object, type, opening_host_capability]
    entity
  end

  def rebuild!(entity, opening_object:, type:, opening_host_capability:)
    rebuilt << [entity, opening_object, type, opening_host_capability]
    entity
  end
end

ExtensionInfillRuntime = Struct.new(:smart_objects, :active_model)

class DoorWindowExtensionCommandRegistrationTest < Minitest::Test
  def setup
    @model = FakeModel.new
    opening_entity = ExtensionInfillEntity.new
    @opening = ExtensionInfillObject.new(
      id: 'opening-1',
      type: 'opening.rectangular',
      owner_module: 'constructflow.opening',
      entity: opening_entity,
      relationships: [{
        'kind' => 'generated_from',
        'target_id' => 'ext-1',
        'role' => 'extension_source',
        'metadata' => { 'slot' => 'attachment_opening', 'domain' => 'opening' }
      }],
      source_state: 'confirmed',
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil
    )
    @objects = ExtensionInfillSmartObjects.new([@opening])
    @runtime = ExtensionInfillRuntime.new(@objects, @model)
    @host = ExtensionInfillOpeningHost.new
    @repository = JiraNot::ConstructFlow::DoorWindow::InstanceRepository.new
    @geometry = ExtensionInfillGeometry.new
    @validator = JiraNot::ConstructFlow::DoorWindow::Validators::DoorWindowValidator.new(opening_host_capability: @host)
  end

  def command(config)
    JiraNot::ConstructFlow::DoorWindow::ExtensionCommandRegistration.generate_or_update(
      runtime: @runtime,
      input: {
        'extension_id' => 'ext-1',
        'intent' => { 'extension_id' => 'ext-1', 'config' => config }
      },
      repository: @repository,
      geometry: @geometry,
      opening_host: @host,
      validator: @validator
    )
  end

  def explicit_door_config
    {
      'enabled' => true,
      'category' => 'door',
      'operation' => 'swing',
      'frame_material' => 'wood',
      'panel_style' => 'solid',
      'handing' => 'right',
      'schedule_mark' => 'D01'
    }
  end

  def test_opt_in_create_uses_generated_attachment_opening_and_stable_provenance
    result = command(explicit_door_config)

    assert_equal 1, result[:created_object_ids].length
    infill = @objects.objects.find { |object| object.owner_module == 'constructflow.door_window' }
    refute_nil infill
    assert_equal 'confirmed', infill.source_state
    assert_equal infill.id, @host.refs.fetch('opening-1').fetch('infill_id')
    assert infill.relationships.any? { |relationship| relationship['kind'] == 'host' && relationship['target_id'] == 'opening-1' }
    generated = infill.relationships.find { |relationship| relationship['kind'] == 'generated_from' }
    assert_equal 'ext-1', generated['target_id']
    assert_equal 'attachment_infill', generated.dig('metadata', 'slot')

    definition = @repository.read(infill.entity)
    assert_equal 'opening-1', definition.opening_object_id
    assert_equal 'D01', definition.schedule_mark
    type = JiraNot::ConstructFlow::DoorWindow::TypeRegistry.new(@model).fetch(definition.type_id)
    assert_equal 'door', type.category
    assert_equal 'swing', type.operation
    assert_equal 1000.0, type.width_mm
    assert_equal 2100.0, type.height_mm
    assert_empty result[:warnings]
  end

  def test_rerun_changes_type_but_preserves_instance_identity
    first = command(explicit_door_config)
    infill_id = first[:created_object_ids].first

    second = command(explicit_door_config.merge('operation' => 'sliding', 'frame_material' => 'aluminium'))

    assert_empty second[:created_object_ids]
    assert_equal [infill_id, 'opening-1'].sort, second[:updated_object_ids].sort
    assert_equal 2, @objects.objects.length
    infill = @objects.fetch_by_id(infill_id)
    definition = @repository.read(infill.entity)
    type = JiraNot::ConstructFlow::DoorWindow::TypeRegistry.new(@model).fetch(definition.type_id)
    assert_equal 'sliding', type.operation
    assert_equal 'aluminium', type.frame_material
    assert_equal 1, @geometry.created.length
    assert_equal 1, @geometry.rebuilt.length
  end

  def test_explicit_disable_detaches_and_reconciles_generated_infill_only
    first = command(explicit_door_config)
    infill = @objects.fetch_by_id(first[:created_object_ids].first)

    result = command('enabled' => false)

    assert_equal [infill.id], result[:removed_object_ids]
    assert_nil @objects.fetch_by_id(infill.id)
    assert infill.entity.erased
    refute @host.refs.key?('opening-1')
    assert_equal [@opening], @objects.objects
  end

  def test_missing_frame_and_panel_data_remain_visible_assumptions
    result = command(
      'enabled' => true,
      'category' => 'door',
      'operation' => 'swing'
    )

    infill = @objects.fetch_by_id(result[:created_object_ids].first)
    assert_equal 'assumed', infill.source_state
    assert_equal 1, result[:warnings].length
    assert_includes result[:warnings].first, 'assumed frame/panel construction data'
  end

  def test_registered_type_can_be_reused_without_redeclaring_type_fields
    registry = JiraNot::ConstructFlow::DoorWindow::TypeRegistry.new(@model)
    registry.register(
      JiraNot::ConstructFlow::DoorWindow::DoorWindowType.new(
        id: 'company.door.d01', category: 'door', operation: 'swing',
        width_mm: 1000, height_mm: 2100, frame_material: 'wood', panel_style: 'solid'
      )
    )

    result = command('enabled' => true, 'type_id' => 'company.door.d01')
    infill = @objects.fetch_by_id(result[:created_object_ids].first)

    assert_equal 'confirmed', infill.source_state
    assert_empty result[:warnings]
    assert_equal 'company.door.d01', @repository.read(infill.entity).type_id
  end

  def test_enabled_infill_without_generated_attachment_opening_is_rejected
    @objects.objects.delete(@opening)

    error = assert_raises(ArgumentError) { command(explicit_door_config) }
    assert_includes error.message, 'attachment opening required'
  end
end
