# frozen_string_literal: true

require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/modules/extension/coordination_plan'

class ExtensionCoordinationPlanTest < Minitest::Test
  def definition
    JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
      boundary_mm: [[0, 0, 0], [6000, 0, 0], [6000, 4000, 0], [0, 4000, 0]],
      program: 'kitchen', base_level_id: 'ffl_0', base_offset_mm: 0,
      target_height_mm: 2800, roof_intent: 'lean_to', attachment_host_id: 'wall-1'
    )
  end

  def test_plan_derives_all_cross_domain_intents
    plan = JiraNot::ConstructFlow::Extension::CoordinationPlan.from_definition(
      extension_id: 'ext-1', definition: definition
    )

    assert_equal %w[drainage electrical interior roof structure surface], plan.modules
    assert_equal 'lean_to', plan.intent_for('roof')['roof_intent']
    assert_equal 'kitchen', plan.intent_for('interior')['program']
    assert_equal true, plan.intent_for('drainage')['roof_rainwater']
  end

  def test_plan_is_serializable
    plan = JiraNot::ConstructFlow::Extension::CoordinationPlan.from_definition(
      extension_id: 'ext-1', definition: definition
    )
    restored = JiraNot::ConstructFlow::Extension::CoordinationPlan.new(
      extension_id: plan.to_h['extension_id'], intents: plan.to_h['intents']
    )

    assert_equal plan.to_h, restored.to_h
  end

  def test_unknown_module_is_rejected
    assert_raises(ArgumentError) do
      JiraNot::ConstructFlow::Extension::CoordinationPlan.new(
        extension_id: 'ext-1', intents: { 'unknown' => {} }
      )
    end
  end
end
