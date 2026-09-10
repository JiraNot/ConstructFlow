# frozen_string_literal: true

require 'minitest/autorun'
require_relative '../../apps/sketchup-extension/constructflow/modules/extension/execution_result'
require_relative '../../apps/sketchup-extension/constructflow/modules/extension/execution_engine'

class ExtensionExecutionEngineTest < Minitest::Test
  def plan
    {
      extension_id: 'ext-01',
      steps: [
        { domain: 'structure', dependencies: [] },
        { domain: 'roof', dependencies: ['structure'] },
        { domain: 'drainage', dependencies: ['roof', 'surface'] }
      ]
    }
  end

  def test_dry_run_does_not_call_handlers
    called = false
    engine = JiraNot::ConstructFlow::ExtensionExecutionEngine.new(
      handlers: { structure: ->(_) { called = true } }
    )

    result = engine.execute(plan, dry_run: true)

    refute called
    assert_equal :preview, result.status
    assert_equal :pending, result.steps.first.status
  end

  def test_failed_dependency_skips_dependents
    engine = JiraNot::ConstructFlow::ExtensionExecutionEngine.new(
      handlers: { structure: ->(_) { raise 'structure failed' }, roof: ->(_) { raise 'must not run' } }
    )

    result = engine.execute(plan)

    assert_equal :failed, result.steps[0].status
    assert_equal :skipped, result.steps[1].status
    assert_equal :skipped, result.steps[2].status
  end

  def test_successful_handler_returns_object_lifecycle_ids
    engine = JiraNot::ConstructFlow::ExtensionExecutionEngine.new(
      handlers: {
        structure: ->(_) { { status: :success, created_object_ids: ['column-01'], updated_object_ids: ['foundation-01'] } }
      }
    )

    result = engine.execute(plan)

    assert result.steps.first.success?
    assert_equal ['column-01'], result.steps.first.created_object_ids
    assert_equal ['foundation-01'], result.steps.first.updated_object_ids
  end
end
