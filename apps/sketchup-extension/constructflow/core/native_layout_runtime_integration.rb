# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module NativeLayoutRuntimeIntegration
        module_function

        def install(runtime)
          singleton = class << runtime; self; end
          return if singleton.method_defined?(:native_layout_export)

          singleton.send(:define_method, :native_layout_export) do
            @native_layout_export ||= Core::NativeLayoutExportService.new(runtime: self)
          end
        end
      end
    end
  end
end
