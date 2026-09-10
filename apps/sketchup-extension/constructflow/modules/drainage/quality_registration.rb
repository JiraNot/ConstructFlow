# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      module QualityRegistration
        module_function

        def install(runtime)
          register_audit(runtime)
          register_takeoff(runtime)
        end

        def register_audit(runtime)
          return if runtime.commands.registered?('AuditDrainageNetwork')
          runtime.commands.register('AuditDrainageNetwork', owner_module: 'constructflow.drainage', transaction: false) do |_command|
            result = NetworkAudit.new(runtime: runtime).run
            warnings = result['issues'].select { |issue| issue['severity'] != 'error' }.map { |issue| issue['message'] }
            {
              warnings: warnings,
              events: [{ name: 'DrainageNetworkAudited', payload: result }]
            }
          end
        end

        def register_takeoff(runtime)
          return if runtime.commands.registered?('BuildDrainageTakeoff')
          runtime.commands.register('BuildDrainageTakeoff', owner_module: 'constructflow.drainage', transaction: false) do |_command|
            result = Quantity::ProjectTakeoff.new(runtime: runtime).build
            { events: [{ name: 'DrainageTakeoffBuilt', payload: result }] }
          end
        end
      end
    end
  end
end
