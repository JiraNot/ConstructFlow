# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module LayoutTemplateRuntimeIntegration
        module_function

        def install(runtime)
          singleton = class << runtime; self; end

          unless singleton.method_defined?(:layout_templates)
            singleton.send(:define_method, :layout_templates) do
              @layout_templates ||= Core::LayoutTemplateRegistry.new
            end
          end

          unless singleton.method_defined?(:layout_template_pins)
            singleton.send(:define_method, :layout_template_pins) do
              @layout_template_pins ||= Core::LayoutTemplatePinStore.new
            end
          end

          unless singleton.method_defined?(:layout_template_asset_verifier)
            singleton.send(:define_method, :layout_template_asset_verifier) do
              @layout_template_asset_verifier ||= Core::LayoutTemplateAssetVerifier.new
            end
          end
        end
      end
    end
  end
end
