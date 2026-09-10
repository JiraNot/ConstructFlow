# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_issue_history_store')

ConstructionIssueHistoryObject = Struct.new(:id, :type, :owner_module, :entity, keyword_init: true)

class ConstructionIssueHistoryObjects
  def initialize(objects)
    @objects = objects
  end

  def fetch_by_id(id)
    @objects.find { |object| object.id.to_s == id.to_s }
  end
end

class ConstructionIssueHistoryStoreTest < Minitest::Test
  def setup
    @extension = ConstructionIssueHistoryObject.new(
      id: 'ext-1',
      type: 'extension.zone',
      owner_module: 'constructflow.extension',
      entity: FakeEntity.new
    )
    runtime = Struct.new(:smart_objects).new(ConstructionIssueHistoryObjects.new([@extension]))
    @store = JiraNot::ConstructFlow::Extension::ConstructionIssueHistoryStore.new(runtime: runtime)
  end

  def settlement(takeoff: 'takeoff-a', drawing: 'drawing-a')
    {
      'status' => 'settled',
      'publishable' => true,
      'takeoff_fingerprint' => takeoff,
      'drawing_fingerprint' => drawing
    }
  end

  def currentness(scope: 'scope-a')
    {
      'status' => 'current',
      'publishable' => true,
      'scope_fingerprint' => scope
    }
  end

  def export_result(layout: '/tmp/P01.layout', pdf: '/tmp/P01.pdf')
    {
      'status' => 'created',
      'layout_path' => layout,
      'pdf_path' => pdf,
      'native_backend' => 'FakeLayout',
      'template_resolution' => {
        'source' => 'registry',
        'key' => 'company.a3',
        'version' => '2.0.0',
        'sha256' => 'abc123',
        'asset_verified' => true
      }
    }
  end

  def record(revision: 'P01', issue_status: 'for_construction', settlement_value: settlement,
             currentness_value: currentness, export_value: export_result)
    @store.record(
      extension_id: 'ext-1',
      revision: revision,
      issue_status: issue_status,
      settlement: settlement_value,
      currentness: currentness_value,
      export_result: export_value
    )
  end

  def test_successful_export_appends_model_local_issue_evidence
    entry = record
    history = @store.read('ext-1')

    assert_match(/\Aissue-[0-9a-f]{20}\z/, entry['issue_id'])
    assert_equal 'P01', entry['revision']
    assert_equal 'for_construction', entry['issue_status']
    assert_equal '/tmp/P01.layout', entry['layout_path']
    assert_equal '/tmp/P01.pdf', entry['pdf_path']
    assert_equal 'company.a3', entry.dig('template', 'key')
    assert_equal true, entry.dig('template', 'asset_verified')
    assert_equal 1, history['entries'].length
    assert_equal entry['issue_id'], @store.latest('ext-1')['issue_id']
  end

  def test_repeated_identical_export_is_idempotent
    first = record
    second = record

    assert_equal first['issue_id'], second['issue_id']
    assert_equal first['recorded_at'], second['recorded_at']
    assert_equal 1, @store.read('ext-1')['entries'].length
  end

  def test_new_revision_or_new_output_fingerprint_appends_history
    first = record
    second = record(
      revision: 'P02',
      settlement_value: settlement(takeoff: 'takeoff-b', drawing: 'drawing-b'),
      currentness_value: currentness(scope: 'scope-b'),
      export_value: export_result(layout: '/tmp/P02.layout', pdf: '/tmp/P02.pdf')
    )

    refute_equal first['issue_id'], second['issue_id']
    history = @store.read('ext-1')
    assert_equal 2, history['entries'].length
    assert_equal %w[P01 P02], history['entries'].map { |entry| entry['revision'] }
  end

  def test_unsettled_or_stale_package_cannot_be_recorded_as_issued_export
    bad_settlement = settlement.merge('publishable' => false, 'status' => 'partial')
    assert_raises(ArgumentError) do
      record(settlement_value: bad_settlement)
    end

    bad_currentness = currentness.merge('publishable' => false, 'status' => 'stale')
    assert_raises(ArgumentError) do
      record(currentness_value: bad_currentness)
    end

    assert_empty @store.read('ext-1')['entries']
  end

  def test_history_survives_reinstantiating_store_from_same_extension_entity
    entry = record
    runtime = Struct.new(:smart_objects).new(ConstructionIssueHistoryObjects.new([@extension]))
    reloaded = JiraNot::ConstructFlow::Extension::ConstructionIssueHistoryStore.new(runtime: runtime)

    assert_equal entry['issue_id'], reloaded.latest('ext-1')['issue_id']
  end
end
