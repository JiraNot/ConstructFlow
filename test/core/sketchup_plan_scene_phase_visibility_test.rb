# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'sketchup_plan_scene_service')

class SketchupPlanScenePhaseVisibilityTest < Minitest::Test
  PhaseObject = Struct.new(:created_phase, :removed_phase, :relationships, keyword_init: true)

  def service
    JiraNot::ConstructFlow::Core::SketchupPlanSceneService.allocate
  end

  def test_new_object_that_explicitly_modifies_existing_host_is_visible_in_demolition_view
    object = PhaseObject.new(
      created_phase: 'new_construction',
      removed_phase: nil,
      relationships: [{ 'kind' => 'host', 'target_id' => 'wall-existing', 'role' => 'modifies_existing_host' }]
    )

    assert service.send(:visible_in_phase?, object, 'demolition')
  end

  def test_ordinary_new_construction_remains_hidden_from_demolition_view
    object = PhaseObject.new(created_phase: 'new_construction', removed_phase: nil, relationships: [])

    refute service.send(:visible_in_phase?, object, 'demolition')
  end

  def test_existing_object_remains_visible_in_demolition_view
    object = PhaseObject.new(created_phase: 'existing', removed_phase: nil, relationships: [])

    assert service.send(:visible_in_phase?, object, 'demolition')
  end
end
