# frozen_string_literal: true

require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/modules/extension/execution_runner'

class ExtensionExecutionRunnerTest < Minitest::Test
  class FakeCommandBus
    attr_reader :calls

    def initialize(fail_on: nil)
      @fail_on = fail_on
      @calls = []
    end

    def execute(name, input, actor:, project_id:)
      @calls << [name, input, actor, project_id]
      return result('failed', errors: ['boom']) if name == @fail_on

      result('success', updated_object_ids: ["obj-#{@calls.length}"])
    end

    private

    def result(status, updated_object_ids: [], errors: [])
      {
        status: status,
        command_id: "cmd-#{@calls.length}",
        created_object_ids: [],
        updated_object_ids: updated_object_ids,
        removed_object_ids: [],
        warnings: [],
        errors: errors
      }
    end
  end

  def plan
    {
      'extension_id' => 'ext-1',
      'program' => 'kitchen',
      'mode' => 'attached',
      'steps' => [
        step('structure'),
        step('surface', ['structure']),
        step('roof', ['structure']),
        step('drainage', %w[roof surface]),
        step('interior', %w[structure surface]),
        step('electrical', %w[structure interior])
      ]
    }
  end

  def step(domain, dependencies = [])
    {
      'domain' => domain,
      'dependencies' => dependencies,
      'action' => 'generate_or_update_intent',
      'geometry_owner' => "constructflow.#{domain}"
    }
  end

  def run_with_failure(command_name)
    bus = FakeCommandBus.new(fail_on: command_name)
    runner = JiraNot::ConstructFlow::Extension::ExecutionRunner.new(command_bus: bus)
    [runner.execute(plan), bus]
  end

  def test_executes_in_plan_order
    bus = FakeCommandBus.new
    runner = JiraNot::ConstructFlow::Extension::ExecutionRunner.new(command_bus: bus)
    result = runner.execute(plan, project_id: 'project-1')

    assert_equal 'success', result['status']
    assert_equal %w[
      GenerateOrUpdateStructureFromExtension
      GenerateOrUpdateSurfaceFromExtension
      GenerateOrUpdateRoofFromExtension
      GenerateOrUpdateDrainageFromExtension
      GenerateOrUpdateInteriorFromExtension
      GenerateOrUpdateElectricalFromExtension
    ], bus.calls.map(&:first)
    assert_empty result['dirty_domains']
  end

  def test_surface_failure_skips_only_dependency_blocked_steps_and_keeps_roof_clean
    result, = run_with_failure('GenerateOrUpdateSurfaceFromExtension')

    statuses = result['steps'].to_h { |item| [item['domain'], item['status']] }
    assert_equal 'failed', statuses['surface']
    assert_equal 'success', statuses['roof']
    assert_equal 'skipped', statuses['drainage']
    assert_equal 'skipped', statuses['interior']
    assert_equal 'skipped', statuses['electrical']
    assert_equal %w[surface drainage interior electrical], result['dirty_domains']
    refute_includes result['dirty_domains'], 'roof'
    assert_equal 'failed', result['status']
  end

  def test_structure_failure_marks_all_transitive_dependents_dirty
    result, = run_with_failure('GenerateOrUpdateStructureFromExtension')

    assert_equal %w[structure surface roof drainage interior electrical], result['dirty_domains']
  end

  def test_roof_failure_dirties_only_roof_and_drainage_branch
    result, = run_with_failure('GenerateOrUpdateRoofFromExtension')

    assert_equal %w[roof drainage], result['dirty_domains']
    refute_includes result['dirty_domains'], 'interior'
    refute_includes result['dirty_domains'], 'electrical'
  end

  def test_interior_failure_dirties_only_interior_and_electrical
    result, = run_with_failure('GenerateOrUpdateInteriorFromExtension')

    assert_equal %w[interior electrical], result['dirty_domains']
    refute_includes result['dirty_domains'], 'drainage'
  end

  def test_dry_run_does_not_dispatch_commands
    bus = FakeCommandBus.new
    runner = JiraNot::ConstructFlow::Extension::ExecutionRunner.new(command_bus: bus)
    result = runner.execute(plan, dry_run: true)

    assert_equal 'preview', result['status']
    assert_empty bus.calls
    assert result['steps'].all? { |item| item['status'] == 'pending' }
    assert_empty result['dirty_domains']
  end
end
