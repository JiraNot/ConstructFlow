# frozen_string_literal: true

require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/modules/extension/extension_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/extension/coordination_plan'

class ExtensionOrchestratorDependencyTest < Minitest::Test
  Definition = Struct.new(:program, :mode, :boundary_mm, :base_level_id, :base_offset_mm,
                          :target_height_mm, :roof_intent, :attachment_host_id)

  def test_unknown_requested_domain_is_not_enabled
    definition = Definition.new('custom', 'construction', [[0, 0, 0], [5000, 0, 0], [5000, 3000, 0], [0, 3000, 0]], nil, 0, 2800, 'lean_to', nil)
    generator = JiraNot::ConstructFlow::Extension::Generator.new(definition)
    result = generator.enabled_domains(domains: { 'electrical' => { 'enabled' => false } })
    refute_includes result, 'electrical'
  end

  def test_plan_has_no_duplicate_domains
    definition = Definition.new('custom', 'construction', [[0, 0, 0], [5000, 0, 0], [5000, 3000, 0], [0, 3000, 0]], nil, 0, 2800, 'lean_to', nil)
    generator = JiraNot::ConstructFlow::Extension::Generator.new(definition)
    orchestrator = JiraNot::ConstructFlow::Extension::Orchestrator.new(generator)
    steps = orchestrator.plan['steps']
    domains = steps.map { |step| step['domain'] }
    assert_equal domains.uniq, domains
  end
end
