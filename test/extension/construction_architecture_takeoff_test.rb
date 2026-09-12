# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/cabinet_run_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/quantity/interior_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/device_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/quantity/electrical_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_takeoff')

ConstructionArchitectureTakeoffObject = Struct.new(
  :id, :type, :owner_module, :entity, :created_phase, :removed_phase, :source_state, :relationships,
  :dirty_flags, keyword_init: true
)

class ConstructionArchitectureTakeoffObjects
  def initialize(objects)
    @objects = objects
  end

  def all = @objects

  def fetch_by_id(id)
    @objects.find { |object| object.id.to_s == id.to_s }
  end
end

class ConstructionArchitectureTakeoffTest < Minitest::Test
  def test_generated_wall_area_and_volume_flow_into_extension_takeoff
    extension_entity = FakeEntity.new
    extension = build_object('ext-1', 'extension.zone', 'constructflow.extension', extension_entity, [])
    JiraNot::ConstructFlow::Extension::Repository.new.write(
      extension_entity,
      JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
        boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]],
        program: 'kitchen', mode: 'construction'
      )
    )

    wall_entity = FakeEntity.new
    wall = build_object(
      'wall-1', 'architecture.wall', 'constructflow.architecture', wall_entity,
      [{ 'kind' => 'generated_from', 'target_id' => 'ext-1', 'role' => 'extension_source' }]
    )
    JiraNot::ConstructFlow::Architecture::WallRepository.new.write(
      wall_entity,
      JiraNot::ConstructFlow::Architecture::WallDefinition.new(
        path_mm: [[0, 0, 0], [4000, 0, 0]], thickness_mm: 100, height_mm: 3000,
        wall_type_id: 'company.wall.aac.100'
      )
    )

    runtime = Struct.new(:smart_objects).new(
      ConstructionArchitectureTakeoffObjects.new([extension, wall])
    )
    takeoff = JiraNot::ConstructFlow::Extension::ConstructionTakeoff.new(runtime: runtime).build('ext-1')
    totals = takeoff['totals'].each_with_object({}) { |item, result| result[item['classification']] = item }

    coverage = takeoff['coverage'].find { |item| item['object_id'] == 'wall-1' }
    assert_equal 'included', coverage['status']
    assert_equal 2, coverage['item_count']
    assert_in_delta 12.0, totals['architecture.wall.gross_area']['value'], 0.0001
    assert_in_delta 1.2, totals['architecture.wall.volume']['value'], 0.0001
    assert_equal ['wall-1'], totals['architecture.wall.gross_area']['source_object_ids']
    assert_equal true, takeoff['current']
    assert_equal [], takeoff['stale_object_ids']
  end

  def test_takeoff_marks_quantity_snapshot_stale_when_object_or_dependency_is_dirty
    extension_entity = FakeEntity.new
    extension = build_object('ext-1', 'extension.zone', 'constructflow.extension', extension_entity, [], ['dirty_dependents'])
    JiraNot::ConstructFlow::Extension::Repository.new.write(extension_entity, JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
      boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]], program: 'kitchen', mode: 'construction'
    ))

    runtime = Struct.new(:smart_objects).new(ConstructionArchitectureTakeoffObjects.new([extension]))
    takeoff = JiraNot::ConstructFlow::Extension::ConstructionTakeoff.new(runtime: runtime).build('ext-1')

    refute takeoff['current']
    assert_equal ['ext-1'], takeoff['stale_object_ids']
    assert_equal ['dirty_dependents'], takeoff['coverage'].first['dirty_flags']
  end

  private

  def build_object(id, type, owner, entity, relationships, dirty_flags = [])
    ConstructionArchitectureTakeoffObject.new(
      id: id,
      type: type,
      owner_module: owner,
      entity: entity,
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil,
      source_state: 'confirmed',
      relationships: relationships,
      dirty_flags: dirty_flags
    )
  end
end
