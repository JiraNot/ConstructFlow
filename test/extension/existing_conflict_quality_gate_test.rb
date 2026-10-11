# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_quality_gate')

ExistingConflictQualityObject = Struct.new(
  :id, :type, :owner_module, :entity, :created_phase, :removed_phase,
  :source_state, :relationships,
  keyword_init: true
)

class ExistingConflictQualityObjects
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

class ExistingConflictQualityGateTest < Minitest::Test
  def setup
    @extension = ExistingConflictQualityObject.new(
      id: 'ext-1',
      type: 'extension.zone',
      owner_module: 'constructflow.extension',
      entity: FakeEntity.new,
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil,
      source_state: 'confirmed',
      relationships: []
    )
    @existing_manhole = ExistingConflictQualityObject.new(
      id: 'mh-1',
      type: 'drainage.manhole',
      owner_module: 'constructflow.drainage',
      entity: FakeEntity.new,
      created_phase: JiraNot::ConstructFlow::Core::Phase::EXISTING,
      removed_phase: nil,
      source_state: 'measured',
      relationships: []
    )
    @runtime = Struct.new(:smart_objects).new(
      ExistingConflictQualityObjects.new([@extension, @existing_manhole])
    )
    @execution = {
      'status' => 'success',
      'steps' => [],
      'dirty_domains' => []
    }
    @scan = {
      'status' => 'conflict',
      'conflicts' => [{
        'rule_id' => 'extension.existing_conflict.existing_manhole',
        'state' => 'unresolved',
        'domain' => 'drainage',
        'object_id' => 'mh-1',
        'object_type' => 'drainage.manhole',
        'conflict_kind' => 'existing_manhole',
        'message' => 'existing manhole overlaps the Extension footprint',
        'evidence' => { 'bbox_min_mm' => [0, 0, 0], 'bbox_max_mm' => [600, 600, 0] }
      }]
    }
  end

  def test_non_strict_reports_existing_conflict_as_warning
    result = JiraNot::ConstructFlow::Extension::ConstructionQualityGate.new(runtime: @runtime).run(
      extension_id: 'ext-1',
      execution: @execution,
      conflict_scan: @scan,
      strict: false
    )

    assert result['publishable']
    issue = result['issues'].find { |value| value['rule_id'] == 'extension.existing_conflict.existing_manhole' }
    assert_equal 'warning', issue['severity']
    assert_equal 'mh-1', issue['object_id']
    assert_equal 'existing_manhole', issue['conflict_kind']
  end

  def test_strict_blocks_unresolved_existing_conflict
    result = JiraNot::ConstructFlow::Extension::ConstructionQualityGate.new(runtime: @runtime).run(
      extension_id: 'ext-1',
      execution: @execution,
      conflict_scan: @scan,
      strict: true
    )

    refute result['publishable']
    assert_equal 'error', result['status']
    issue = result['issues'].find { |value| value['rule_id'] == 'extension.existing_conflict.existing_manhole' }
    assert_equal 'error', issue['severity']
  end
end
