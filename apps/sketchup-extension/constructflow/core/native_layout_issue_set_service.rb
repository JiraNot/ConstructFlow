# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class NativeLayoutIssueSetService
        def initialize(runtime:, adapter: NativeLayoutIssueSetAdapter.new)
          @runtime = runtime
          @adapter = adapter
        end

        def export(issue_set, layout_path:, pdf_path: nil, skp_path: nil, template_path: nil,
                   template_key: nil, template_version: nil, verify_template_asset: true)
          issue_plan = @runtime.drawing_issue_sets.build(issue_set)
          model_path = resolve_skp_path(skp_path)
          resolved = resolve_template(
            issue_plan,
            explicit_path: template_path,
            template_key: template_key,
            template_version: template_version,
            verify_asset: verify_template_asset
          )
          decorated_plan = apply_template_definition(issue_plan, resolved['definition'])
          result = @adapter.build(
            issue_plan: decorated_plan,
            skp_path: model_path,
            layout_path: layout_path,
            pdf_path: pdf_path,
            template_path: resolved['path']
          )
          completed = result.merge('template_resolution' => resolved['trace']).freeze
          publish_native_export(
            completed,
            skp_path: model_path,
            template_resolution: resolved['trace']
          )
          completed
        end

        private

        def publish_native_export(result, skp_path:, template_resolution:)
          return unless @runtime.respond_to?(:events) && @runtime.events

          viewport_count = Array(result['pages']).sum { |page| page['viewport_count'].to_i }
          @runtime.events.publish(
            'NativeLayoutExportCompleted',
            {
              export_kind: 'issue_set',
              native_backend: result['native_backend'].to_s,
              skp_path: skp_path.to_s,
              layout_path: result['layout_path'].to_s,
              pdf_path: result['pdf_path'].to_s,
              preset_id: '',
              issue_set_id: result['issue_set_id'].to_s,
              sheet_count: result['sheet_count'].to_i,
              viewport_count: viewport_count,
              template_resolution: template_resolution || {}
            },
            source_module: 'constructflow.drawing',
            project_id: @runtime.respond_to?(:project) ? @runtime.project&.project_id : nil
          )
        end

        def resolve_template(issue_plan, explicit_path:, template_key:, template_version:, verify_asset:)
          if explicit_path && !explicit_path.to_s.empty?
            return {
              'path' => explicit_path.to_s,
              'definition' => nil,
              'trace' => { 'source' => 'explicit_path', 'path' => explicit_path.to_s, 'asset_verified' => false }.freeze
            }.freeze
          end

          registry = @runtime.respond_to?(:layout_templates) ? @runtime.layout_templates : nil
          return no_template unless registry && !registry.all.empty?

          scope_id = issue_plan['template_scope_id'].to_s
          use_case = issue_plan['template_use_case'].to_s
          pin = if !scope_id.empty? && @runtime.respond_to?(:layout_template_pins)
                  @runtime.layout_template_pins.fetch(scope_id: scope_id, use_case: use_case)
                end
          template_key ||= pin&.template_key
          template_version ||= pin&.version

          first = issue_plan.fetch('sheet_plans').first
          definition = registry.resolve!(
            paper_size: first.dig('sheet', 'paper_size'),
            orientation: first.dig('sheet', 'orientation'),
            drawing_family: first.dig('source', 'drawing_family'),
            use_case: use_case,
            preferred_key: template_key,
            preferred_version: template_version
          )
          ensure_definition_supports_all!(definition, issue_plan.fetch('sheet_plans'), use_case)
          verification = if verify_asset && @runtime.respond_to?(:layout_template_asset_verifier)
                           @runtime.layout_template_asset_verifier.verify!(definition, expected_sha256: pin&.sha256.to_s)
                         else
                           { 'verified' => false, 'sha256' => '' }
                         end

          {
            'path' => definition.path,
            'definition' => definition,
            'trace' => definition.to_h.merge(
              'source' => pin ? 'pin' : 'registry',
              'scope_id' => scope_id,
              'asset_verified' => verification['verified'] == true,
              'sha256' => verification['sha256'].to_s
            ).freeze
          }.freeze
        end

        def ensure_definition_supports_all!(definition, sheet_plans, use_case)
          sheet_plans.each do |plan|
            next if definition.supports?(
              paper_size: plan.dig('sheet', 'paper_size'),
              orientation: plan.dig('sheet', 'orientation'),
              drawing_family: plan.dig('source', 'drawing_family'),
              use_case: use_case
            )
            raise ArgumentError, "LayOut issue-set template #{definition.key}@#{definition.version} is incompatible with sheet #{plan.dig('sheet', 'number')}"
          end
        end

        def apply_template_definition(issue_plan, definition)
          return issue_plan unless definition
          deep_transform(issue_plan) do |copy|
            Array(copy['sheet_plans']).each do |plan|
              block = plan.dig('sheet', 'title_block')
              next unless block
              block['template_key'] = definition.key
              block['placeholder_map'] ||= {}
              block['placeholder_map']['template_key'] = definition.key
              block['placeholder_map']['field_tokens'] = definition.placeholder_tokens unless definition.placeholder_tokens.empty?
              block['placeholder_map']['revision_prefix'] = definition.revision_prefix
              block['placeholder_map']['strategy'] = definition.strategy
            end
          end
        end

        def deep_transform(value)
          copy = deep_copy(value)
          yield copy
          copy.freeze
        end

        def deep_copy(value)
          case value
          when Hash
            value.each_with_object({}) { |(key, item), result| result[key.to_s] = deep_copy(item) }
          when Array
            value.map { |item| deep_copy(item) }
          else
            value
          end
        end

        def no_template
          { 'path' => nil, 'definition' => nil, 'trace' => { 'source' => 'none', 'path' => '', 'asset_verified' => false }.freeze }.freeze
        end

        def resolve_skp_path(explicit_path)
          path = explicit_path.to_s
          return path unless path.empty?
          model = @runtime.respond_to?(:active_model) ? @runtime.active_model : nil
          path = model.path.to_s if model && model.respond_to?(:path)
          raise ArgumentError, 'SketchUp model must be saved before native LayOut issue-set export' if path.to_s.empty?
          path
        end
      end

      module NativeLayoutIssueSetRuntimeIntegration
        module_function

        def install(runtime)
          singleton = class << runtime; self; end
          return if singleton.method_defined?(:native_layout_issue_sets)
          singleton.send(:define_method, :native_layout_issue_sets) do
            @native_layout_issue_sets ||= Core::NativeLayoutIssueSetService.new(runtime: self)
          end
        end
      end
    end
  end
end
