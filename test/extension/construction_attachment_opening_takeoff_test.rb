# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/cabinet_run_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/quantity/interior_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/device_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/quantity/electrical_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_takeoff')

AttachmentTakeoffObject = Struct.new(
  :id, :type, :owner_module, :entity, :created_phase, :removed_phase, :source_state, :relationships,
  keyword_init: true
)

class AttachmentTakeoffObjects
  def initialize(objects)
    @objects = objects
  end

  def all = @objects

  def fetch_by_id(id)
    @objects.find { |object| object.id.to_s == id.to_s }
  end
end

class ConstructionAttachmentOpeningTakeoffTest < Minitest::Test
  def test_generated_attachment_opening_reports_demolition_area_against_existing_host
    extension_entity = FakeEntity.new
    host_entity = FakeEntity.new
    opening_entity = FakeEntity.new

    extension = build_object('ext-1', 'extension.zone', 'constructflow.extension', extension_entity, JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION, [])
    host = build_object('host-1', 'architecture.wall', 'constructflow.architecture', host_entity, JiraNot::ConstructFlow::Core::Phase::EXISTING, [])
    opening = build_object(
      'opening-1', 'opening.rectangular', 'constructflow.opening', opening_entity,
      JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      [{ 'kind' => 'generated_from', 'target_id' => 'ext-1', 'role' => 'extension_source', 'metadata' => { 'slot' => 'attachment_opening' } }]
    )

    JiraNot::ConstructFlow::Extension::Repository.new.write(
      extension_entity,
      JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
        boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]],
        program: 'kitchen', mode: 'construction', attachment_host_id: 'host-1'
      )
    )
    JiraNot::ConstructFlow::Opening::OpeningRepository.new.write(
      opening_entity,
      JiraNot::ConstructFlow::Opening::OpeningDefinition.new(
        host_object_id: 'host-1', segment_index: 0, start_offset_mm: 1000,
        width_mm: 1000, height_mm: 2100, sill_mm: 0
      )
    )

    runtime = Struct.new(:smart_objects).new(AttachmentTakeoffObjects.new([extension, host, opening]))
    takeoff = JiraNot::ConstructFlow::Extension::ConstructionTakeoff.new(runtime: runtime).build('ext-1')

    coverage = takeoff['coverage'].find { |item| item['object_id'] == 'opening-1' }
    assert_equal 'included', coverage['status']
    total = takeoff['totals'].find { |item| item['classification'] == 'opening.wall.removed_area' }
    refute_nil total
    assert_equal 'demolition', total['phase_scope']
    assert_in_delta 2.1, total['value'], 0.0001
    assert_equal ['opening-1'], total['source_object_ids']
  end

  private

  def build_object(id, type, owner, entity, created_phase, relationships)
    AttachmentTakeoffObject.new(
      id: id,
      type: type,
      owner_module: owner,
      entity: entity,
      created_phase: created_phase,
      removed_phase: nil,
      source_state: 'confirmed',
      relationships: relationships
    )
  end
end
