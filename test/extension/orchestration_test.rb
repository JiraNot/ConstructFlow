# frozen_string_literal: true

require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/modules/extension/extension_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/extension/coordination_plan'

class ExtensionOrchestrationTest < Minitest::Test
  def definition
    JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
      boundary_mm: [[0, 0, 0], [6000, 0, 0], [6000, 4000, 0], [0, 4000, 0]],
      program: 'kitchen',
      base_level_id: 'ffl_0',
      target_height_mm: 3000,
      roof_intent: 'lean_to',
      attachment_host_id: 'wall-1'
    )
  end

  def test_generator_defaults_and_domain_override
    generator = JiraNot::ConstructFlow::Extension::Generator.new(definition)
    intents = generator.intents(
      extension_id: 'ext-1',
      domains: { 'electrical' => { 'enabled' => false } }
    )

    assert_equal 'ext-1', intents['extension_id']
    assert_equal 'kitchen', intents['program']
    assert intents['domains']['architecture']['enabled']
    refute intents['domains']['electrical']['enabled']
    assert_equal %w[architecture structure surface roof drainage interior], generator.enabled_domains(
      domains: { 'electrical' => { 'enabled' => false } }
    )
  end

  def test_orchestrator_orders_dependencies
    generator = JiraNot::ConstructFlow::Extension::Generator.new(definition)
    orchestrator = JiraNot::ConstructFlow::Extension::Orchestrator.new(generator)
    plan = orchestrator.plan(extension_id: 'ext-1')

    assert_equal %w[architecture structure surface roof drainage interior electrical], plan['steps'].map { |step| step['domain'] }
    architecture = plan['steps'].find { |step| step['domain'] == 'architecture' }
    assert_empty architecture['dependencies']
    drainage = plan['steps'].find { |step| step['domain'] == 'drainage' }
    assert_equal %w[roof surface], drainage['dependencies']
  end

  def test_orchestrator_respects_disabled_domains
    generator = JiraNot::ConstructFlow::Extension::Generator.new(definition)
    orchestrator = JiraNot::ConstructFlow::Extension::Orchestrator.new(generator)
    plan = orchestrator.plan(domains: { 'surface' => { 'enabled' => false } })

    domains = plan['steps'].map { |step| step['domain'] }
    refute_includes domains, 'surface'
    assert_includes domains, 'architecture'
    assert_includes domains, 'drainage'
  end

  def test_regeneration_rules_are_explicit
    generator = JiraNot::ConstructFlow::Extension::Generator.new(definition)
    orchestrator = JiraNot::ConstructFlow::Extension::Orchestrator.new(generator)
    rules = orchestrator.plan['regeneration']

    assert_equal %w[roof drainage], rules['roof_changed']
    assert_includes rules['boundary_changed'], 'architecture'
    assert_includes rules['height_changed'], 'architecture'
    assert_equal %w[architecture interior electrical], rules['architecture_changed']
  end
end
