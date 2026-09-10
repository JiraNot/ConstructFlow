# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/drawing_issue_set')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_output_settlement')

ConstructionSettlementObject = Struct.new(
  :id, :type, :owner_module, :entity, :dirty_flags,
  keyword_init: true
)

class ConstructionSettlementSmartObjects
  attr_reader :objects

  def initialize(objects)
    @objects = objects
  end

  def all
    objects.dup
  end

  def fetch_by_id(id)
    objects.find { |object| object.id.to_s == id.to_s }
  end

  def clear_dirty(entity, *flags)
    object = objects.find { |candidate| candidate.entity.equal?(entity) }
    raise KeyError, 'settlement object not found' unless object

    object.dirty_flags -= flags.flatten.map(&:to_s)
    object
  end
end

class ConstructionOutputSettlementTest < Minitest::Test
  def setup
    @extension = object(
      id: 'ext-1',
      type: 'extension.zone',
      owner: 'constructflow.extension',
      dirty: %w[dirty_quantity dirty_drawing dirty_dependents]
    )
    @column = object(
      id: 'column-1',
      type: 'structure.column',
      owner: 'constructflow.structure',
      dirty: %w[dirty_quantity dirty_drawing]
    )
    @objects = ConstructionSettlementSmartObjects.new([@extension, @column])
    @runtime = Struct.new(:smart_objects).new(@objects)
    @service = JiraNot::ConstructFlow::Extension::ConstructionOutputSettlement.new(runtime: @runtime)
  end

  def object(id:, type:, owner:, dirty: [])
    ConstructionSettlementObject.new(
      id: id,
      type: type,
      owner_module: owner,
      entity: FakeEntity.new,
      dirty_flags: dirty.dup
    )
  end

  def issue_set
    JiraNot::ConstructFlow::Core::DrawingIssueSet.new(
      id: 'construction.ext-1.P01',
      name: 'Construction Set',
      revision: 'P01',
      issue_status: 'working',
      sheets: [
        JiraNot::ConstructFlow::Core::DrawingIssueSheetRequest.new(
          preset_id: 'structure.construction'
        )
      ]
    )
  end

  def takeoff(column_status: 'included')
    {
      'coverage' => [
        {
          'object_id' => 'ext-1',
          'object_type' => 'extension.zone',
          'source_module' => 'constructflow.extension',
          'status' => 'included',
          'item_count' => 2
        },
        {
          'object_id' => 'column-1',
          'object_type' => 'structure.column',
          'source_module' => 'constructflow.structure',
          'status' => column_status,
          'item_count' => column_status == 'included' ? 2 : 0
        }
      ],
      'totals' => [
        {
          'phase_scope' => 'new_construction',
          'classification' => 'structure.column.concrete',
          'unit' => 'm3',
          'value' => 0.112,
          'source_object_ids' => ['column-1']
        }
      ]
    }
  end

  def drawing_refresh(rendered: ['column-1'])
    [{
      'preset_id' => 'structure.construction',
      'scene_name' => 'ConstructFlow - Structure Plan - Construction',
      'source_object_ids' => ['column-1'],
      'rendered_count' => rendered.length,
      'rendered_object_ids' => rendered
    }]
  end

  def test_successful_settlement_clears_only_completed_output_flags
    result = @service.settle(
      extension_id: 'ext-1',
      takeoff: takeoff,
      issue_set: issue_set,
      drawing_refresh: drawing_refresh,
      drawings_required: true
    )

    assert_equal 'settled', result['status']
    assert result['publishable']
    assert_empty @column.dirty_flags
    assert_equal ['dirty_dependents'], @extension.dirty_flags
    assert_equal %w[column-1 ext-1], result.dig('quantity', 'settled_object_ids')
    assert_equal %w[column-1 ext-1], result.dig('drawing', 'settled_object_ids')
    assert_match(/\A[0-9a-f]{64}\z/, result['takeoff_fingerprint'])
    assert_match(/\A[0-9a-f]{64}\z/, result['drawing_fingerprint'])
  end

  def test_quantity_provider_error_stays_dirty_and_blocks_settlement
    result = @service.settle(
      extension_id: 'ext-1',
      takeoff: takeoff(column_status: 'provider_error'),
      issue_set: issue_set,
      drawing_refresh: drawing_refresh,
      drawings_required: false
    )

    assert_equal 'partial', result['status']
    refute result['publishable']
    assert_includes @column.dirty_flags, 'dirty_quantity'
    assert_equal ['column-1'], result.dig('quantity', 'unsettled_object_ids')
    assert_equal ['provider_error'], result.dig('quantity', 'unsettled_statuses')
  end

  def test_missing_rendered_object_blocks_publication_and_keeps_drawing_dirty
    result = @service.settle(
      extension_id: 'ext-1',
      takeoff: takeoff,
      issue_set: issue_set,
      drawing_refresh: drawing_refresh(rendered: []),
      drawings_required: true
    )

    assert_equal 'partial', result['status']
    refute result['publishable']
    assert_equal ['column-1'], result.dig('drawing', 'missing_rendered_object_ids')
    assert_includes @column.dirty_flags, 'dirty_drawing'
    assert_includes @extension.dirty_flags, 'dirty_drawing'
  end

  def test_record_persists_issue_evidence_without_changing_semantic_identity
    settlement = @service.settle(
      extension_id: 'ext-1',
      takeoff: takeoff,
      issue_set: issue_set,
      drawing_refresh: drawing_refresh,
      drawings_required: true
    )
    currentness = {
      'status' => 'current',
      'publishable' => true,
      'scope_fingerprint' => 'scope-abc'
    }

    state = @service.record(
      extension_id: 'ext-1',
      settlement: settlement,
      currentness: currentness,
      revision: 'P01',
      issue_status: 'working',
      export_requested: false
    )
    reloaded = @service.read('ext-1')

    assert_equal 'ext-1', @extension.id
    assert_equal 'P01', state['revision']
    assert_equal 'current', state['currentness_status']
    assert_equal 'scope-abc', state['scope_fingerprint']
    assert_equal 'not_requested', state['export_status']
    assert_equal state['takeoff_fingerprint'], reloaded['takeoff_fingerprint']
    assert_equal state['drawing_fingerprint'], reloaded['drawing_fingerprint']
    refute_empty reloaded['recorded_at']
  end
end
