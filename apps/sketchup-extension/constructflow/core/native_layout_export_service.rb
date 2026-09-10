# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class NativeLayoutExportService
        def initialize(runtime:, adapter: NativeLayoutAdapter.new)
          @runtime = runtime
          @adapter = adapter
        end

        def export_preset(preset_id, layout_path:, pdf_path: nil, skp_path: nil, template_path: nil,
                          template_version: nil, issue_kind: nil, **plan_options)
          model_path = resolve_skp_path(skp_path)
          preset = @runtime.drawing_view_presets.fetch!(preset_id)
          resolved_template = resolve_template(
            explicit_path: template_path,
            template_key: plan_options[:template_key] || 'constructflow.standard',
            template_version: template_version,
            paper_size: plan_options[:paper_size] || 'A3',
            orientation: plan_options[:orientation] || 'landscape',
            drawing_family: preset.drawing_family,
            issue_kind: issue_kind
          )
          apply_template_defaults!(plan_options, resolved_template)
          plan = @runtime.layout_export_plans.build_for_preset(preset_id, **plan_options)
          result = @adapter.build(
            export_plan: plan,
            skp_path: model_path,
            layout_path: layout_path,
            pdf_path: pdf_path,
            template_path: resolved_template && resolved_template[:path]
          )
          result.merge(
            'template_identity' => resolved_template && resolved_template[:identity],
            'template_version' => resolved_template && resolved_template[:version]
          ).freeze
        end

        private

        def resolve_template(explicit_path:, template_key:, template_version:, paper_size:, orientation:, drawing_family:, issue_kind:)
          path = explicit_path.to_s
          return { path: path, identity: nil, version: nil, asset: nil } unless path.empty?
          return nil unless @runtime.respond_to?(:layout_templates)

          asset = @runtime.layout_templates.resolve(
            key: template_key,
            version: template_version,
            paper_size: paper_size,
            orientation: orientation,
            drawing_family: drawing_family,
            issue_kind: issue_kind
          )
          { path: asset.path, identity: asset.identity, version: asset.version, asset: asset }
        rescue KeyError
          nil
        end

        def apply_template_defaults!(plan_options, resolved_template)
          asset = resolved_template && resolved_template[:asset]
          return unless asset

          plan_options[:template_key] ||= asset.key
          map = asset.placeholder_map
          return unless map

          data = map.respond_to?(:to_h) ? map.to_h : map
          return unless data.is_a?(Hash)
          normalized = data.each_with_object({}) { |(key, value), result| result[key.to_s] = value }
          plan_options[:placeholder_tokens] ||= normalized['field_tokens']
          plan_options[:template_strategy] ||= normalized['strategy']
          plan_options[:revision_placeholder_prefix] ||= normalized['revision_prefix']
        end

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
