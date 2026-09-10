# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      module RouteDetourRegistration
        module_function

        def install(runtime)
          return if runtime.commands.registered?('PlanDrainageClearanceDetours')

          runtime.commands.register('PlanDrainageClearanceDetours', owner_module: 'constructflow.drainage', transaction: false) do |command|
            input = command[:input]
            start_id = value(input, :start_connector_id).to_s
            end_id = value(input, :end_connector_id).to_s
            raise ArgumentError, 'start_connector_id required' if start_id.empty?
            raise ArgumentError, 'end_connector_id required' if end_id.empty?

            result = RouteDetourPlanner.new(runtime: runtime).alternatives(
              start_connector: runtime.connectors.connector(start_id),
              end_connector: runtime.connectors.connector(end_id),
              clearance_mm: value(input, :clearance_mm) || 300.0,
              start_invert_mm: value(input, :start_invert_mm),
              end_invert_mm: value(input, :end_invert_mm),
              minimum_slope_percent: value(input, :minimum_slope_percent) || Validators::DrainageValidator::MIN_SLOPE_PERCENT
            )
            warnings = result['requires_manual'] ? ['no clear offset detour was found around the first known structural clash; manual intervention required'] : []
            {
              warnings: warnings,
              events: [{ name: 'DrainageClearanceDetoursPlanned', payload: result }]
            }
          end
        end

        def value(input, key)
          input[key] || input[key.to_s]
        end
      end
    end
  end
end
