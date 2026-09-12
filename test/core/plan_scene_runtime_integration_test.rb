# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'core', 'plan_scene_runtime_integration')

class PlanSceneRuntimeIntegrationTest < Minitest::Test
  PlanScenes = Struct.new(:refreshes) do
    def refresh_preset(preset_id)
      refreshes << preset_id
    end
  end
  Diagnostics = Struct.new(:warnings) do
    def warn(*args, **kwargs)
      warnings << [args, kwargs]
    end
  end

  class Runtime
    attr_reader :events, :plan_scenes, :diagnostics

    def initialize
      @events = JiraNot::ConstructFlow::Core::EventBus.new
      @plan_scenes = PlanScenes.new([])
      @diagnostics = Diagnostics.new([])
    end
  end

  def test_geometry_changed_refreshes_plan_scene_once_per_event
    runtime = Runtime.new

    JiraNot::ConstructFlow::Core::PlanSceneRuntimeIntegration.install_geometry_refresh_subscription(runtime)
    runtime.events.publish('GeometryChanged', {}, source_module: 'constructflow.architecture', object_ids: ['wall-1'])

    assert_equal ['architecture.construction'], runtime.plan_scenes.refreshes
  end

  def test_subscription_is_idempotent
    runtime = Runtime.new

    2.times { JiraNot::ConstructFlow::Core::PlanSceneRuntimeIntegration.install_geometry_refresh_subscription(runtime) }
    runtime.events.publish('GeometryChanged')

    assert_equal 1, runtime.plan_scenes.refreshes.length
  end
end
