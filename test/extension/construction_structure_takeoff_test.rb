# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/cabinet_run_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/quantity/interior_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/device_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/quantity/electrical_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_takeoff')

ConstructionStructureTakeoffObject = Struct.new(
  :id, :type, :owner_module, :entity, :created_phase, :removed_phase, :source_state, :relationships,
  keyword_init: true
)

class ConstructionStructureTakeoffObjects
  def initialize(objects)
    @objects = objects
  end

  def all = @objects

  def fetch_by_id(id)
    @objects.find { |object| object.id.to_s == id.to_s }
  end
end

class ConstructionStructureTakeoffTest < Minitest::Test
  def test_foundation_concrete_and_formwork_flow_into_extension_takeoff
    extension_entity = FakeEntity.new
    extension = build_object('ext-1', 'extension.zone', 'constructflow.extension', extension_entity, [])
    JiraNot::ConstructFlow::Extension::Repository.new.write(
      extension_entity,
      JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
        boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]],
        program: 'carport', mode: 'construction'
      )
    )

    foundation_entity = FakeEntity.new
    foundation = build_object(
      'foundation-1', 'structure.foundation', 'constructflow.structure', foundation_entity,
      [{ 'kind' => 'generated_from', 'target_id' => 'ext-1', 'role' => 'extension_source' }]
    )
    JiraNot::ConstructFlow::Structure::Repository.new.write_foundation(
      foundation_entity,
      JiraNot::ConstructFlow::Structure::FoundationDefinition.new(
        center_mm: [0, 0, 0], size_mm: [1000, 1000, 300], top_elevation_mm: 0,
        supported_object_id: 'column-1', engineering_status: 'preliminary'
      )
    )

    runtime = Struct.new(:smart_objects).new(
      ConstructionStructureTakeoffObjects.new([extension, foundation])
    )
    takeoff = JiraNot::ConstructFlow::Extension::ConstructionTakeoff.new(runtime: runtime).build('ext-1')
    totals = takeoff['totals'].each_with_object({}) { |item, result| result[item['classification']] = item }

    assert_equal 'included', takeoff['coverage'].find { |item| item['object_id'] == 'foundation-1' }['status']
    assert_in_delta 0.3, totals['structure.spread_footing.concrete']['value'], 0.0001
    assert_in_delta 1.2, totals['structure.spread_footing.formwork']['value'], 0.0001
    assert_equal ['foundation-1'], totals['structure.spread_footing.concrete']['source_object_ids']
  end

  private

  def build_object(id, type, owner, entity, relationships)
    ConstructionStructureTakeoffObject.new(
      id: id,
      type: type,
      owner_module: owner,
      entity: entity,
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil,
      source_state: 'confirmed',
      relationships: relationships
    )
  end
end
