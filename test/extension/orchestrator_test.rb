# frozen_string_literal: true

require_relative '../../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/modules/extension/orchestrator'

class ExtensionOrchestratorTest < Minitest::Test
  Definition = Struct.new(:program, :mode, :boundary_mm, :base_level_id, :base_offset_mm,
                          :target_height_mm, :roof_intent, :attachment_host_id)

  def setup
    definition = Definition.new('kitchen', 'new', [[0, 0], [6000, 0], [6000, 4000], [0, 4000]],
                                'L1', 0, 3000, { 'type' => 'lean_to' }, 'wall-01')
    generator = JiraNot::ConstructFlow::Extension::Generator.new(definition)
    @orchestrator = JiraNot::ConstructFlow::Extension::Orchestrator.new(generator)
  end

  def test_plan_orders_dependencies_before_dependents
    plan = @orchestrator.plan
    assert_equal %w[structure surface roof drainage electrical interior], plan[:steps].map { |step| step[:domain] }
  end

  def test_plan_keeps_dependencies_explicit
    plan = @orchestrator.plan
    drainage = plan[:steps].find { |step| step[:domain] == 'drainage' }
    assert_equal %w[roof surface], drainage[:dependencies]
  end

  def test_plan_can_disable_domain
    plan = @orchestrator.plan(surface: { enabled: false })
    domains = plan[:steps].map { |step| step[:domain] }
    refute_includes domains, 'surface'
    assert_includes domains, 'drainage'
  end

  def test_plan_contains_regeneration_rules
    plan = @orchestrator.plan
    assert_includes plan[:regeneration][:boundary_changed], 'roof'
    assert_includes plan[:regeneration][:roof_changed], 'drainage'
  end
end
