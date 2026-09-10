# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module LayoutExportRuntimeIntegration
        module_function

        def install(runtime)
          singleton = class << runtime; self; end
          return if singleton.method_defined?(:layout_export_plans)

          singleton.send(:define_method, :layout_export_plans) do
            @layout_export_plans ||= Core::LayoutExportPlanBuilder.new(runtime: self)
          end
        end
      end
    end
  end
end
