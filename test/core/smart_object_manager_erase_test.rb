# frozen_string_literal: true

require_relative '../test_helper'

class ErasableSmartEntity < FakeEntity
  attr_reader :erased

  def erase!
    @erased = true
    true
  end
end

class SmartObjectManagerEraseTest < Minitest::Test
  def test_erase_removes_model_entity_from_runtime_index
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    entity = ErasableSmartEntity.new
    object = manager.create(
      entity: entity,
      type: 'test.generated_item',
      owner_module: 'constructflow.test',
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION
    )

    removed = manager.erase!(entity)

    assert_equal object.id, removed.id
    assert entity.erased
    assert_nil manager.fetch_by_id(object.id)
    assert_equal 0, manager.size
  end

  def test_erase_rejects_non_smart_entities
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)

    assert_raises(KeyError) { manager.erase!(ErasableSmartEntity.new) }
  end

  def test_marks_host_and_transitive_dependents_dirty
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    host_entity = FakeEntity.new
    opening_entity = FakeEntity.new
    infill_entity = FakeEntity.new
    unrelated_entity = FakeEntity.new
    host = manager.create(entity: host_entity, type: 'architecture.wall', owner_module: 'constructflow.architecture')
    opening = manager.create(entity: opening_entity, type: 'opening.rectangular', owner_module: 'constructflow.opening')
    infill = manager.create(entity: infill_entity, type: 'door_window.instance', owner_module: 'constructflow.door_window')
    manager.create(entity: unrelated_entity, type: 'test.unrelated', owner_module: 'constructflow.test')
    manager.add_relationship(opening_entity, kind: 'host', target_id: host.id)
    manager.add_relationship(infill_entity, kind: 'host', target_id: opening.id)

    assert_equal [host.id, opening.id, infill.id], manager.mark_dirty_with_dependents(host_entity, 'dirty_drawing')
    assert manager.fetch(host_entity).dirty_flags.include?('dirty_drawing')
    assert manager.fetch(opening_entity).dirty_flags.include?('dirty_drawing')
    assert manager.fetch(infill_entity).dirty_flags.include?('dirty_drawing')
    refute manager.fetch(unrelated_entity).dirty_flags.include?('dirty_drawing')
  end
end
