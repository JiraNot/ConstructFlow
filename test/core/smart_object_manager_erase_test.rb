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
end
