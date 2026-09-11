# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_copy_identity_repair')

NativeCopyObject = Struct.new(:id, :type, :entity, :relationships, keyword_init: true)

class NativeCopyEntity
  attr_reader :entities

  def initialize(children = [])
    @entities = children
  end
end

class NativeCopySmartObjects
  attr_reader :dirty_calls

  def initialize(original:, copies: [])
    @by_entity = {}
    @by_id = { original.id => original }
    @by_entity[original.entity] = original
    copies.each { |object| @by_entity[object.entity] = object }
    @next_id = 2
    @dirty_calls = []
  end

  def fetch(entity)
    @by_entity[entity]
  end

  def fetch_by_id(id)
    @by_id[id.to_s]
  end

  def ensure_unique_identity!(entity)
    object = @by_entity.fetch(entity)
    indexed = @by_id[object.id.to_s]
    return object if indexed.nil? || indexed.entity.equal?(entity)

    object.id = "obj-#{@next_id}"
    @next_id += 1
    @by_id[object.id] = object
    object
  end

  def update_relationships(entity, relationships)
    @by_entity.fetch(entity).relationships = relationships
  end

  def add_relationship(entity, kind:, target_id:, role:, metadata: {})
    @by_entity.fetch(entity).relationships << {
      'kind' => kind,
      'target_id' => target_id,
      'role' => role,
      'metadata' => metadata
    }
  end

  def mark_dirty(entity, *flags)
    @dirty_calls << [entity, flags]
  end
end

NativeCopyRuntime = Struct.new(:smart_objects, :diagnostics)

class NativeCopyIdentityRepairTest < Minitest::Test
  def setup
    @original_entity = NativeCopyEntity.new
    @copy_entity = NativeCopyEntity.new
    @original = NativeCopyObject.new(
      id: 'obj-1', type: 'roof.system', entity: @original_entity,
      relationships: [{ 'kind' => 'generated_from', 'target_id' => 'ext-1' }]
    )
    @copy = NativeCopyObject.new(
      id: 'obj-1', type: 'roof.system', entity: @copy_entity,
      relationships: [
        { 'kind' => 'generated_from', 'target_id' => 'ext-1' },
        { 'kind' => 'supports', 'target_id' => 'structure-1' }
      ]
    )
    @smart_objects = NativeCopySmartObjects.new(original: @original, copies: [@copy])
    @repair = JiraNot::ConstructFlow::Core::NativeCopyIdentityRepair.new(
      runtime: NativeCopyRuntime.new(@smart_objects, nil)
    )
  end

  def test_duplicate_identity_is_detected_without_mutation
    refute @repair.needs_repair?(@original_entity)
    assert @repair.needs_repair?(@copy_entity)
    assert_equal 'obj-1', @copy.id
  end

  def test_repair_assigns_new_identity_detaches_graph_and_marks_outputs_dirty
    result = @repair.repair_tree(@copy_entity)

    assert_equal 1, result.length
    assert_equal 'obj-1', result.first['source_object_id']
    assert_equal 'obj-2', result.first['new_object_id']
    assert_equal 'obj-2', @copy.id
    assert_equal 'obj-1', @original.id

    assert_equal 1, @copy.relationships.length
    relation = @copy.relationships.first
    assert_equal 'copied_from', relation['kind']
    assert_equal 'obj-1', relation['target_id']
    assert_equal 'native_copy_source', relation['role']
    assert_equal true, relation.dig('metadata', 'detached')
    refute @copy.relationships.any? { |item| item['kind'] == 'generated_from' }

    flags = @smart_objects.dirty_calls.last[1]
    assert_equal %w[dirty_dependents dirty_quantity dirty_drawing], flags
  end

  def test_non_smart_parent_repairs_nested_smart_copy
    nested_copy_entity = NativeCopyEntity.new
    nested_copy = NativeCopyObject.new(
      id: 'obj-1', type: 'architecture.wall', entity: nested_copy_entity,
      relationships: [{ 'kind' => 'host', 'target_id' => 'wall-host' }]
    )
    smart_objects = NativeCopySmartObjects.new(original: @original, copies: [nested_copy])
    repair = JiraNot::ConstructFlow::Core::NativeCopyIdentityRepair.new(
      runtime: NativeCopyRuntime.new(smart_objects, nil)
    )
    parent = NativeCopyEntity.new([nested_copy_entity])

    assert repair.needs_repair?(parent)
    result = repair.repair_tree(parent)

    assert_equal 1, result.length
    assert_equal 'obj-2', nested_copy.id
    assert_equal 'copied_from', nested_copy.relationships.first['kind']
  end

  def test_original_identity_is_not_modified
    result = @repair.repair_tree(@original_entity)

    assert_empty result
    assert_equal 'obj-1', @original.id
    assert_equal 'generated_from', @original.relationships.first['kind']
    assert_empty @smart_objects.dirty_calls
  end
end
