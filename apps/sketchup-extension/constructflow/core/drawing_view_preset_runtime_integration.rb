# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module DrawingViewPresetRuntimeIntegration
        module_function

        def install(runtime)
          singleton = class << runtime; self; end
          return if singleton.method_defined?(:drawing_view_presets)

          registry = DrawingViewPresetRegistry.new
          DrawingViewPresetRegistration.install(registry)
          singleton.send(:define_method, :drawing_view_presets) { registry }
        end
      end
    end
  end
end
