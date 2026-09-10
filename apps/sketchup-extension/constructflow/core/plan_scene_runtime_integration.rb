# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module PlanSceneRuntimeIntegration
        module_function

        def install(runtime)
          singleton = class << runtime; self; end
          return if singleton.method_defined?(:plan_scenes)

          singleton.send(:define_method, :plan_scenes) do
            @plan_scenes ||= Core::SketchupPlanSceneService.new(runtime: self)
          end
        end
      end
    end
  end
end
