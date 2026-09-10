# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module PlanGraphicStyleRuntimeIntegration
        module_function

        def install(runtime)
          singleton = class << runtime; self; end
          return if singleton.method_defined?(:plan_graphic_styles)

          registry = PlanGraphicStyleRegistry.new
          PlanGraphicStyleRegistration.install(registry)
          singleton.send(:define_method, :plan_graphic_styles) { registry }
        end
      end
    end
  end
end
