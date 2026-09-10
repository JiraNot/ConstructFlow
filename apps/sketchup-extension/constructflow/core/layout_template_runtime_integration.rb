# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module LayoutTemplateRuntimeIntegration
        module_function

        def install(runtime)
          singleton = class << runtime; self; end
          return if singleton.method_defined?(:layout_templates)

          singleton.send(:define_method, :layout_templates) do
            @layout_templates ||= Core::LayoutTemplateRegistry.new
          end
        end
      end
    end
  end
end
