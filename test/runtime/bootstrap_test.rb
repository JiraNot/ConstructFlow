# frozen_string_literal: true

# Bootstrap contract test.
# Loads the REAL production bootstrap (main.rb -> Runtime.boot! + bootstrap.rb)
# against the minimal SketchUp stub in test/sketchup.rb (found via -Itest),
# then asserts the runtime ends up in a consistent, idempotent state.
# This is the only test that exercises the full require graph the same way
# SketchUp does at startup.

require_relative '../test_helper'
require 'sketchup'

# The stub reports this model as the active one while boot! runs,
# mirroring SketchUp having a document open at extension load time.
Sketchup.active_model = FakeModel.new

BOOTSTRAP = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'bootstrap.rb')

EXPECTED_MODULE_IDS = %w[
  constructflow.core
  constructflow.architecture
  constructflow.opening
  constructflow.door_window
  constructflow.extension
  constructflow.roof
  constructflow.structure
  constructflow.surface
  constructflow.interior
  constructflow.library
  constructflow.drainage
  constructflow.electrical
  constructflow.costing
].freeze

EXPECTED_CORE_COMMANDS = %w[
  SetWorkingPhase
  UpdateProjectMetadata
  CreateLevel
  ModifyLevel
  ConvertSelectionToSmartObject
  DemolishObject
].freeze

class BootstrapContractTest < Minitest::Test
  def test_bootstrap_loads_and_boots_runtime
    require BOOTSTRAP

    runtime = JiraNot::ConstructFlow::Runtime
    assert runtime.booted?, 'Runtime.boot! must have run during bootstrap load'
    refute_nil runtime.active_model
    refute_nil runtime.project
    refute_nil runtime.levels
  end

  def test_all_builtin_modules_registered
    require BOOTSTRAP

    ids = JiraNot::ConstructFlow::Runtime.modules.registered_ids
    EXPECTED_MODULE_IDS.each do |expected|
      assert_includes ids, expected, "module #{expected} must be registered by bootstrap"
    end
  end

  def test_core_commands_registered
    require BOOTSTRAP

    commands = JiraNot::ConstructFlow::Runtime.commands
    EXPECTED_CORE_COMMANDS.each do |expected|
      assert commands.registered?(expected), "core command #{expected} must be registered by boot"
    end
  end

  def test_boot_is_idempotent
    require BOOTSTRAP

    runtime = JiraNot::ConstructFlow::Runtime
    modules_before = runtime.modules.registered_ids
    levels_before = runtime.levels.size

    JiraNot::ConstructFlow::Runtime.boot!

    assert_equal modules_before, runtime.modules.registered_ids,
                 'second boot! must not register anything again'
    assert_equal levels_before, runtime.levels.size,
                 'second boot! must not re-seed levels'
  end

  def test_requiring_bootstrap_twice_is_harmless
    require BOOTSTRAP
    modules_before = JiraNot::ConstructFlow::Runtime.modules.registered_ids

    require BOOTSTRAP # Ruby no-ops the second require of the same file

    assert_equal modules_before, JiraNot::ConstructFlow::Runtime.modules.registered_ids
  end

  def test_attach_model_survives_nil_model
    require BOOTSTRAP

    # SketchUp can report a nil active model (e.g. during shutdown).
    JiraNot::ConstructFlow::Runtime.attach_model(nil)

    assert JiraNot::ConstructFlow::Runtime.booted?
  end
end
