# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class RouteAlternativePlanner
        def initialize(runtime:, planner: RoutePlanner.new, evaluator: nil)
          @runtime = runtime
          @planner = planner
          @evaluator = evaluator || RouteCandidateEvaluator.new(runtime: runtime)
        end

        def alternatives(start_connector:, end_connector:, start_invert_mm: nil, end_invert_mm: nil,
                         minimum_slope_percent: Validators::DrainageValidator::MIN_SLOPE_PERCENT)
          candidates = %w[x_first y_first].map do |preference|
            plan = @planner.plan(
              start_connector: start_connector,
              end_connector: end_connector,
              mode: 'auto',
              start_invert_mm: start_invert_mm,
              end_invert_mm: end_invert_mm,
              minimum_slope_percent: minimum_slope_percent,
              orthogonal_preference: preference
            )
            evaluation = @evaluator.evaluate(plan.route_nodes_mm)
            {
              'id' => preference,
              'plan' => plan.to_h,
              'evaluation' => evaluation
            }.freeze
          end

          clear = candidates.select { |item| item['evaluation']['clear'] }
          recommended = clear.first
          {
            'candidates' => candidates.freeze,
            'recommended_id' => recommended && recommended['id'],
            'requires_manual' => recommended.nil?,
            'status' => recommended ? 'route_available' : 'manual_intervention_required'
          }.freeze
        end
      end
    end
  end
end
