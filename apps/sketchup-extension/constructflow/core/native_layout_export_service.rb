# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class NativeLayoutExportService
        def initialize(runtime:, adapter: NativeLayoutAdapter.new)
          @runtime = runtime
          @adapter = adapter
        end

        def export_preset(preset_id, layout_path:, pdf_path: nil, skp_path: nil, template_path: nil, **plan_options)
          model_path = resolve_skp_path(skp_path)
          plan = @runtime.layout_export_plans.build_for_preset(preset_id, **plan_options)
          @adapter.build(
            export_plan: plan,
            skp_path: model_path,
            layout_path: layout_path,
            pdf_path: pdf_path,
            template_path: template_path
          )
        end

        private

        def resolve_skp_path(explicit_path)
          path = explicit_path.to_s
          return path unless path.empty?

          model = @runtime.respond_to?(:active_model) ? @runtime.active_model : nil
          path = model.path.to_s if model && model.respond_to?(:path)
          raise ArgumentError, 'SketchUp model must be saved before native LayOut export' if path.to_s.empty?
          path
        end
      end
    end
  end
end
