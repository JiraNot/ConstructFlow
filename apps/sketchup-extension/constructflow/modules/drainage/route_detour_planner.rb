# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class RouteDetourPlanner
        def initialize(runtime:, planner: RoutePlanner.new, evaluator: nil)
          @runtime = runtime
          @planner = planner
          @evaluator = evaluator || RouteCandidateEvaluator.new(runtime: runtime)
        end

        def alternatives(start_connector:, end_connector:, clearance_mm: 300.0,
                         start_invert_mm: nil, end_invert_mm: nil,
                         minimum_slope_percent: Validators::DrainageValidator::MIN_SLOPE_PERCENT)
          clearance = Float(clearance_mm)
          raise ArgumentError, 'clearance_mm must be greater than zero' unless clearance.positive?

          baseline = @planner.plan(
            start_connector: start_connector, end_connector: end_connector, mode: 'auto',
            start_invert_mm: start_invert_mm, end_invert_mm: end_invert_mm,
            minimum_slope_percent: minimum_slope_percent, orthogonal_preference: 'x_first'
          )
          baseline_eval = @evaluator.evaluate(baseline.route_nodes_mm)
          return clear_baseline_result(baseline, baseline_eval) if baseline_eval['clear']

          first_clash = baseline_eval.fetch('clashes').first
          obstacle = first_clash && first_clash['box_mm']
          return no_route_result([], 'clash evidence has no obstacle bounds') unless obstacle

          start_point = connector_point(start_connector)
          end_point = connector_point(end_connector)
          candidates = detour_anchors(obstacle, start_point, end_point, clearance).map do |id, via|
            plan = @planner.plan(
              start_connector: start_connector, end_connector: end_connector, mode: 'semi_auto',
              via_nodes_mm: via, start_invert_mm: start_invert_mm, end_invert_mm: end_invert_mm,
              minimum_slope_percent: minimum_slope_percent, orthogonal_preference: 'x_first'
            )
            evaluation = @evaluator.evaluate(plan.route_nodes_mm)
            {
              'id' => id,
              'plan' => plan.to_h,
              'evaluation' => evaluation,
              'horizontal_length_mm' => plan.horizontal_length_mm
            }.freeze
          end
          clear = candidates.select { |item| item['evaluation']['clear'] }
                            .sort_by { |item| [item['horizontal_length_mm'], item['id']] }
          recommended = clear.first
          {
            'status' => recommended ? 'detour_available' : 'manual_intervention_required',
            'recommended_id' => recommended && recommended['id'],
            'requires_manual' => recommended.nil?,
            'clearance_mm' => clearance,
            'baseline' => { 'plan' => baseline.to_h, 'evaluation' => baseline_eval }.freeze,
            'candidates' => candidates.freeze
          }.freeze
        end

        private

        def clear_baseline_result(plan, evaluation)
          {
            'status' => 'baseline_clear', 'recommended_id' => 'baseline', 'requires_manual' => false,
            'clearance_mm' => nil, 'baseline' => { 'plan' => plan.to_h, 'evaluation' => evaluation }.freeze,
            'candidates' => [].freeze
          }.freeze
        end

        def no_route_result(candidates, reason)
          {
            'status' => 'manual_intervention_required', 'recommended_id' => nil, 'requires_manual' => true,
            'reason' => reason, 'candidates' => candidates.freeze
          }.freeze
        end

        def detour_anchors(box, start_point, end_point, clearance)
          min = box['min'] || box[:min]
          max = box['max'] || box[:max]
          raise ArgumentError, 'obstacle bounds require min/max' unless min && max
          xmin = Float(min[0]) - clearance
          xmax = Float(max[0]) + clearance
          ymin = Float(min[1]) - clearance
          ymax = Float(max[1]) + clearance
          z = start_point[2]
          {
            'below' => [[start_point[0], ymin, z], [end_point[0], ymin, z]],
            'above' => [[start_point[0], ymax, z], [end_point[0], ymax, z]],
            'left' => [[xmin, start_point[1], z], [xmin, end_point[1], z]],
            'right' => [[xmax, start_point[1], z], [xmax, end_point[1], z]]
          }
        end

        def connector_point(connector)
          point = connector && (connector['position_mm'] || connector[:position_mm])
          raise ArgumentError, 'connector position required' unless point
          values = Array(point)
          [Float(values[0]), Float(values[1]), Float(values[2])]
        end
      end
    end
  end
end
