# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module RepresentationRuntimeIntegration
        module_function

        def install(runtime)
          registry = RepresentationRegistry.new(diagnostics: runtime.diagnostics)
          runtime.define_singleton_method(:representations) { registry }
          registry
        end
      end
    end
  end
end
