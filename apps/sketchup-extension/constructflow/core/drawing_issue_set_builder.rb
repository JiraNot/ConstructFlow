# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class DrawingIssueSetBuilder
        def initialize(runtime:)
          @runtime = runtime
        end

        def build(issue_set)
          raise ArgumentError, 'issue_set must be DrawingIssueSet' unless issue_set.is_a?(DrawingIssueSet)

          plans = issue_set.sheets.map do |request|
            options = request.options.merge(
              revision: issue_set.revision,
              issue_status: issue_set.issue_status
            )
            @runtime.layout_export_plans.build_for_preset(request.preset_id, **options)
          end

          issue_set.to_h.merge(
            'sheet_plans' => plans.freeze,
            'sheet_count' => plans.length
          ).freeze
        end
      end

      module DrawingIssueSetRuntimeIntegration
        module_function

        def install(runtime)
          singleton = class << runtime; self; end
          return if singleton.method_defined?(:drawing_issue_sets)

          singleton.send(:define_method, :drawing_issue_sets) do
            @drawing_issue_sets ||= Core::DrawingIssueSetBuilder.new(runtime: self)
          end
        end
      end
    end
  end
end
