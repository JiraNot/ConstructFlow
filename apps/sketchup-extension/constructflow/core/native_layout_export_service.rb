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
                          template_key: nil, template_version: nil, template_use_case: 'construction', **plan_options)
          model_path = resolve_skp_path(skp_path)
          resolved = resolve_template(
            preset_id,
            explicit_path: template_path,
            template_key: template_key,
            template_version: template_version,
            use_case: template_use_case,
            plan_options: plan_options
          )
          plan = @runtime.layout_export_plans.build_for_preset(preset_id, **resolved.fetch('plan_options'))
          result = @adapter.build(
            export_plan: plan,
            skp_path: model_path,
            layout_path: layout_path,
            pdf_path: pdf_path,
            template_path: resolved['template_path']
          )
          result.merge('template_resolution' => resolved['trace']).freeze
        end

        private

        def resolve_template(preset_id, explicit_path:, template_key:, template_version:, use_case:, plan_options:)
          options = symbolize_keys(plan_options || {})
          if explicit_path && !explicit_path.to_s.empty?
            options[:template_key] = template_key if template_key
            return {
              'template_path' => explicit_path.to_s,
              'plan_options' => options,
              'trace' => {
                'source' => 'explicit_path',
                'key' => template_key.to_s,
                'version' => template_version.to_s,
                'path' => explicit_path.to_s
              }.freeze
            }.freeze
          end

          registry = @runtime.respond_to?(:layout_templates) ? @runtime.layout_templates : nil
          return unresolved_template(options) unless registry && !registry.all.empty?

          preset = @runtime.drawing_view_presets.fetch!(preset_id)
          paper_size = (options[:paper_size] || 'A3').to_s
          orientation = (options[:orientation] || 'landscape').to_s
          definition = registry.resolve!(
            paper_size: paper_size,
            orientation: orientation,
            drawing_family: preset.drawing_family,
            use_case: use_case,
            preferred_key: template_key,
            preferred_version: template_version
          )

          options[:template_key] = definition.key
          options[:placeholder_tokens] = definition.placeholder_tokens unless definition.placeholder_tokens.empty? || options.key?(:placeholder_tokens)
          options[:revision_placeholder_prefix] = definition.revision_prefix unless options.key?(:revision_placeholder_prefix)
          options[:template_strategy] = definition.strategy unless options.key?(:template_strategy)

          {
            'template_path' => definition.path,
            'plan_options' => options,
            'trace' => definition.to_h.merge('source' => 'registry').freeze
          }.freeze
        end

        def unresolved_template(options)
          {
            'template_path' => nil,
            'plan_options' => options,
            'trace' => { 'source' => 'none', 'key' => '', 'version' => '', 'path' => '' }.freeze
          }.freeze
        end

        def symbolize_keys(value)
          value.each_with_object({}) { |(key, item), result| result[key.to_sym] = item }
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
