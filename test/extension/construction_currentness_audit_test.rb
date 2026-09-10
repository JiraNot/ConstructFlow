# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/drawing_issue_set')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_issue_set_factory')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_currentness_audit')

CurrentnessAuditObject = Struct.new(
  :id, :type, :owner_module, :created_phase, :removed_phase, :source_state,
  :relationships, :updated_at,
  keyword_init: true
)

class CurrentnessAuditObjects
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

class ConstructionCurrentnessAuditTest < Minitest::Test
  def extension
    CurrentnessAuditObject.new(
      id: 'ext-1', type: 'extension.zone', owner_module: 'constructflow.extension',
      created_phase: 'new_construction', removed_phase: nil, source_state: 'confirmed',
      relationships: [], updated_at: '2026-09-10T00:00:00Z'
    )
  end

  def column
    CurrentnessAuditObject.new(
      id: 'col-1', type: 'structure.column', owner_module: 'constructflow.structure',
      created_phase: 'new_construction', removed_phase: nil, source_state: 'confirmed',
      relationships: [{ 'kind' => 'generated_from', 'target_id' => 'ext-1', 'role' => 'extension_source' }],
      updated_at: '2026-09-10T00:01:00Z'
    )
  end

  def runtime
    Struct.new(:smart_objects).new(CurrentnessAuditObjects.new([extension, column]))
  end

  def takeoff
    {
      'coverage' => [
        { 'object_id' => 'ext-1', 'status' => 'included' },
        { 'object_id' => 'col-1', 'status' => 'included' }
      ]
    }
  end

  def test_export_currentness_requires_drawing_refresh_from_same_run
    result = JiraNot::ConstructFlow::Extension::ConstructionCurrentnessAudit.new(runtime: runtime).run(
      extension_id: 'ext-1',
      takeoff: takeoff,
      drawing_refresh: [],
      drawings_required: true
    )

    assert_equal 'stale', result['status']
    refute result['publishable']
    assert result['issues'].any? { |issue| issue['rule_id'] == 'construction.drawing.refresh_required' }
  end

  def test_current_scoped_drawing_and_takeoff_are_publishable
    result = JiraNot::ConstructFlow::Extension::ConstructionCurrentnessAudit.new(runtime: runtime).run(
      extension_id: 'ext-1',
      takeoff: takeoff,
      drawing_refresh: [{
        'preset_id' => 'structure.construction',
        'source_object_ids' => ['col-1'],
        'rendered_object_ids' => ['col-1']
      }],
      drawings_required: true
    )

    assert_equal 'current', result['status']
    assert result['publishable']
    assert_equal 64, result['scope_fingerprint'].length
  end
end
