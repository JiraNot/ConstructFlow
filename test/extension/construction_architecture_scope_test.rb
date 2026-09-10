# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/drawing_issue_set')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_issue_set_factory')

ArchitectureScopeObject = Struct.new(
  :id, :type, :owner_module, :entity, :relationships, :display_name,
  keyword_init: true
)

class ArchitectureScopeObjects
  def initialize(objects)
    @objects = objects
  end

  def all
    @objects
  end

  def fetch_by_id(id)
    @objects.find { |object| object.id.to_s == id.to_s }
  end
end

class ConstructionArchitectureScopeTest < Minitest::Test
  def object(id:, type:, owner:, relationships: [], display_name: nil)
    ArchitectureScopeObject.new(
      id: id,
      type: type,
      owner_module: owner,
      entity: FakeEntity.new,
      relationships: relationships,
      display_name: display_name || id
    )
  end

  def generated_from(extension_id)
    [{
      'kind' => 'generated_from',
      'target_id' => extension_id,
      'role' => 'extension_source'
    }]
  end

  def test_architecture_scope_keeps_project_context_and_only_selected_extension_generated_objects
    extension_a = object(id: 'ext-a', type: 'extension.zone', owner: 'constructflow.extension')
    extension_b = object(id: 'ext-b', type: 'extension.zone', owner: 'constructflow.extension')
    existing_wall = object(id: 'wall-existing', type: 'architecture.wall', owner: 'constructflow.architecture')
    opening = object(id: 'opening-context', type: 'opening.void', owner: 'constructflow.opening')
    door = object(id: 'door-context', type: 'door_window.instance', owner: 'constructflow.door_window')
    wall_a = object(
      id: 'wall-a', type: 'architecture.wall', owner: 'constructflow.architecture',
      relationships: generated_from('ext-a')
    )
    wall_b = object(
      id: 'wall-b', type: 'architecture.wall', owner: 'constructflow.architecture',
      relationships: generated_from('ext-b')
    )
    opening_b = object(
      id: 'opening-b', type: 'opening.void', owner: 'constructflow.opening',
      relationships: generated_from('ext-b')
    )

    runtime = Struct.new(:smart_objects).new(
      ArchitectureScopeObjects.new([
        extension_a, extension_b, existing_wall, opening, door, wall_a, wall_b, opening_b
      ])
    )
    factory = JiraNot::ConstructFlow::Extension::ConstructionIssueSetFactory.new(runtime: runtime)

    ids = factory.object_ids_for_family(extension_id: 'ext-a', family: 'architecture')

    assert_equal %w[door-context opening-context wall-a wall-existing], ids
    refute_includes ids, 'wall-b'
    refute_includes ids, 'opening-b'
  end
end
