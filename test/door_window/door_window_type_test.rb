# frozen_string_literal: true

require_relative '../test_helper'

class DoorWindowTypeTest < Minitest::Test
  DoorWindow = JiraNot::ConstructFlow::DoorWindow
  Core = JiraNot::ConstructFlow::Core

  def test_fixed_sliding_and_swing_types_share_one_family_model
    fixed = DoorWindow::DoorWindowType.new(
      id: 'window.fixed.1200', category: 'window', operation: 'fixed', width_mm: 1200, height_mm: 1200
    )
    sliding = DoorWindow::DoorWindowType.new(
      id: 'window.slide.1800', category: 'window', operation: 'sliding', width_mm: 1800, height_mm: 1200
    )
    swing = DoorWindow::DoorWindowType.new(
      id: 'door.swing.900', category: 'door', operation: 'swing', width_mm: 900, height_mm: 2100,
      panel_style: 'solid'
    )

    assert fixed.valid?
    assert sliding.valid?
    assert swing.valid?
    assert_equal ['fixed'], fixed.panel_roles
    assert_equal %w[fixed slide_right], sliding.panel_roles
    assert_equal ['swing_right'], swing.panel_roles
  end

  def test_type_registry_persists_and_updates_shared_type
    model = FakeModel.new
    registry = DoorWindow::TypeRegistry.new(model)
    type = DoorWindow::DoorWindowType.new(
      id: 'W01', name: 'Sliding Window', category: 'window', operation: 'sliding',
      width_mm: 1800, height_mm: 1200
    )

    registry.register(type)
    reloaded = DoorWindow::TypeRegistry.new(model)
    assert_equal 'Sliding Window', reloaded.fetch('W01').name
    assert_equal 1, reloaded.size

    updated = reloaded.update('W01') do |current|
      current.with(frame_material: 'wood', frame_width_mm: 60)
    end
    assert_equal 'wood', updated.frame_material
    assert_equal 60.0, DoorWindow::TypeRegistry.new(model).fetch('W01').frame_width_mm
  end

  def test_make_unique_semantics_can_copy_type_without_changing_instance_host
    model = FakeModel.new
    registry = DoorWindow::TypeRegistry.new(model)
    source = DoorWindow::DoorWindowType.new(
      id: 'W01', category: 'window', operation: 'fixed', width_mm: 1200, height_mm: 1200
    )
    registry.register(source)
    unique = DoorWindow::DoorWindowType.new(
      id: 'W01-U1', name: 'W01 Unique', category: source.category, operation: source.operation,
      width_mm: source.width_mm, height_mm: source.height_mm,
      frame_material: source.frame_material, frame_width_mm: source.frame_width_mm,
      panel_roles: source.panel_roles, panel_style: source.panel_style
    )
    registry.register(unique)

    instance = DoorWindow::InstanceDefinition.new(type_id: 'W01', opening_object_id: 'cf_opening_1')
    changed = instance.with(type_id: unique.id)

    assert_equal 'cf_opening_1', changed.opening_object_id
    assert_equal 'W01-U1', changed.type_id
    assert_equal 2, registry.size
  end

  def test_instance_repository_round_trip_uses_owned_namespace
    entity = FakeEntity.new
    repository = DoorWindow::InstanceRepository.new
    definition = DoorWindow::InstanceDefinition.new(
      type_id: 'D01', opening_object_id: 'cf_opening_1', handing: 'right', schedule_mark: 'D01-A'
    )

    repository.write(entity, definition)
    restored = repository.read(entity)

    assert_equal definition.to_h, restored.to_h
    assert_nil Core::AttributeStore.new(entity).read('instance_definition')
    refute_nil Core::AttributeStore.new(entity).read_json(
      'instance_definition', nil, dictionary: 'constructflow.door_window'
    )
  end

  def test_instance_parameters_round_trip_and_drive_quantity_formula
    entity = FakeEntity.new
    repository = DoorWindow::InstanceRepository.new
    definition = DoorWindow::InstanceDefinition.new(
      type_id: 'W01', opening_object_id: 'cf_opening_1', parameters: { 'frame' => 75 }
    )
    repository.write(entity, definition)
    restored = repository.read(entity)
    assert_equal({ 'frame' => 75 }, restored.parameters)

    smart_object = Core::SmartObject.new(
      entity: entity, id: 'dw-1', type: 'door_window.instance', owner_module: 'constructflow.door_window',
      schema_version: 1, display_name: 'Window', created_phase: Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil, level_refs: [], status: 'active', relationships: [], geometry_refs: [],
      catalog_ref: nil, source_state: 'confirmed', revision_meta: {}, created_at: nil, updated_at: nil,
      dirty_flags: []
    )
    type = DoorWindow::DoorWindowType.new(
      id: 'W01', category: 'window', operation: 'fixed', width_mm: 1000, height_mm: 2000, frame_width_mm: 50
    )
    items = DoorWindow::Quantity::DoorWindowQuantityProvider.new.quantities(
      smart_object: smart_object, type: type, instance_parameters: restored.parameters
    )
    glazing = items.find { |item| item[:classification] == 'door_window.glazing.clear_area' }
    assert_in_delta 1.5725, glazing[:value], 0.0001
  end

  def test_quantity_provider_is_traceable
    entity = FakeEntity.new
    model = FakeModel.new([entity])
    manager = Core::SmartObjectManager.new(model: model)
    smart_object = manager.create(
      entity: entity,
      type: 'door_window.instance',
      owner_module: 'constructflow.door_window',
      created_phase: Core::Phase::NEW_CONSTRUCTION
    )
    type = DoorWindow::DoorWindowType.new(
      id: 'W01', category: 'window', operation: 'sliding', width_mm: 1800, height_mm: 1200,
      frame_width_mm: 50, panel_style: 'glazed'
    )

    items = DoorWindow::Quantity::DoorWindowQuantityProvider.new.quantities(
      smart_object: smart_object,
      type: type
    )

    unit = items.find { |item| item[:classification] == 'door_window.window.unit' }
    frame = items.find { |item| item[:classification] == 'door_window.frame.perimeter' }
    glass = items.find { |item| item[:classification] == 'door_window.glazing.clear_area' }
    assert_equal smart_object.id, unit[:source_object_id]
    assert_equal 1.0, unit[:value]
    assert_in_delta 6.0, frame[:value], 0.0001
    assert_in_delta 1.87, glass[:value], 0.0001
    assert_equal 'new_construction', unit[:phase_scope]
  end

  def test_type_exposes_shared_parametric_resolution_for_instance_override
    type = DoorWindow::DoorWindowType.new(
      id: 'W-PARAM', category: 'window', operation: 'fixed', width_mm: 1000, height_mm: 2000,
      frame_width_mm: 50
    )

    resolved = type.parametric_parameters(instance_parameters: { 'frame' => 75 })

    assert_equal 850.0, resolved['clear_width']
    assert_equal 1850.0, resolved['clear_height']
    assert_equal 1_572_500.0, resolved['clear_area']
  end
end
