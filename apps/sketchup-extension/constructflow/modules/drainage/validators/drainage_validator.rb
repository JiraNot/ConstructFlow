# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      module Validators
        class DrainageValidator
          MIN_SLOPE_PERCENT = 1.0

          def validate_manhole(definition)
            definition.errors.map { |message| issue('drainage.manhole.validity', 'error', message) }.freeze
          end

          def validate_route(definition)
            issues = definition.errors.map { |message| issue('drainage.route.validity', 'error', message) }
            return issues.freeze unless definition.errors.empty?

            unless definition.invert_known?
              issues << issue(
                'drainage.route.invert_unknown',
                'warning',
                'route invert is unknown; verify on site before treating slope as compliant',
                state: 'verify_on_site'
              )
              return issues.freeze
            end

            slope = definition.slope_percent
            if slope.negative?
              issues << issue(
                'drainage.route.reverse_slope',
                'error',
                format('route has reverse gravity slope %.3f%%', slope)
              )
            elsif slope < MIN_SLOPE_PERCENT
              issues << issue(
                'drainage.route.insufficient_slope',
                'warning',
                format('route slope %.3f%% is below configured %.3f%%', slope, MIN_SLOPE_PERCENT)
              )
            end
            issues.freeze
          end

          private

          def issue(rule_id, severity, message, extra = {})
            {
              rule_id: rule_id,
              severity: severity,
              message: message
            }.merge(extra).freeze
          end
        end
      end
    end
  end
end
