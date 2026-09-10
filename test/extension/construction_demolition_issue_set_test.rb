# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'drawing_issue_set')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_issue_set_factory')

class ConstructionDemolitionIssueSetTest < Minitest::Test
  DrawingObject = Struct.new(
    :id, :type, :owner_module, :entity, :created_phase, :removed_phase,
    :source_state, :relationships, :display_name,
    keyword_init: true
  )

  class Objects
    def initialize(values)
      @values = values
    end

    def all = @values

    def fetch_by_id(id)
      @values.find { |object| object.id.to_s == id.to_s }
    end
  end

  def object(id:, type:, owner:, created_phase: 'new_construction', relationships: [], display_name: nil)
    DrawingObject.new(
      id: id,
      type: type,
      owner_module: owner,
      entity: FakeEntity.new,
      created_phase: created_phase,
      removed_phase: nil,
      source_state: 'confirmed',
      relationships: relationships,
      display_name: display_name || id
    )
  end

  def generated_from(extension_id)
    { 'kind' => 'generated_from', 'target_id' => extension_id, 'role' => 'extension_source' }
  end

  def test_existing_host_attachment_opening_adds_a100_demolition_before_a101_proposed
    extension = object(id: 'ext-1', type: 'extension.zone', owner: 'constructflow.extension', display_name: 'Kitchen Extension')
    host = object(
      id: 'wall-existing', type: 'architecture.wall', owner: 'constructflow.architecture',
      created_phase: 'existing'
    )
    opening = object(
      id: 'opening-1', type: 'opening.rectangular', owner: 'constructflow.opening',
      relationships: [
        generated_from('ext-1'),
        { 'kind' => 'host', 'target_id' => 'wall-existing', 'role' => 'modifies_existing_host' }
      ]
    )
    runtime = Struct.new(:smart_objects).new(Objects.new([extension, host, opening]))
    factory = JiraNot::ConstructFlow::Extension::ConstructionIssueSetFactory.new(runtime: runtime)

    issue_set = factory.build(extension_id: 'ext-1')

    assert factory.architecture_demolition_required?('ext-1')
    assert_equal %w[architecture.demolition architecture.construction], issue_set.sheets.map(&:preset_id)
    assert_equal %w[A-100 A-101], issue_set.sheets.map { |sheet| sheet.options[:sheet_number] }
  end

  def test_new_construction_host_does_not_create_demolition_sheet
    extension = object(id: 'ext-1', type: 'extension.zone', owner: 'constructflow.extension')
    host = object(id: 'wall-new', type: 'architecture.wall', owner: 'constructflow.architecture')
    opening = object(
      id: 'opening-1', type: 'opening.rectangular', owner: 'constructflow.opening',
      relationships: [
        generated_from('ext-1'),
        { 'kind' => 'host', 'target_id' => 'wall-new', 'role' => 'modifies_existing_host' }
      ]
    )
    runtime = Struct.new(:smart_objects).new(Objects.new([extension, host, opening]))
    factory = JiraNot::ConstructFlow::Extension::ConstructionIssueSetFactory.new(runtime: runtime)

    issue_set = factory.build(extension_id: 'ext-1')

    refute factory.architecture_demolition_required?('ext-1')
    assert_equal ['architecture.construction'], issue_set.sheets.map(&:preset_id)
    assert_equal ['A-101'], issue_set.sheets.map { |sheet| sheet.options[:sheet_number] }
  end
end
