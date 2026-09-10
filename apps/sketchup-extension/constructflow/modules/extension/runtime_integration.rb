# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      module RuntimeIntegration
        module_function

        def install(runtime)
          Architecture::ExtensionCommandRegistration.install(runtime)
          Opening::ExtensionCommandRegistration.install(runtime)
          DoorWindow::ExtensionCommandRegistration.install(runtime)
          Structure::ExtensionCommandRegistration.install(runtime)
          Surface::ExtensionCommandRegistration.install(runtime)
          Roof::ExtensionCommandRegistration.install(runtime)
          Drainage::ExtensionCommandRegistration.install(runtime)
          Interior::ExtensionCommandRegistration.install(runtime)
          Electrical::ExtensionCommandRegistration.install(runtime)
          runner = ExecutionRunner.new(command_bus: runtime.commands)

          runtime.define_singleton_method(:extension_execution_runner) { runner }
          runtime.define_singleton_method(:extension_plan) do |definition, options = {}|
            Orchestrator.new(Generator.new(definition)).plan(options)
          end
          runtime.define_singleton_method(:execute_extension) do |plan, dry_run: false, actor: { kind: 'automation' }, project_id: nil|
            runner.execute(
              plan,
              dry_run: dry_run,
              actor: actor,
              project_id: project_id || runtime.project&.project_id
            )
          end

          runner
        end
      end
    end
  end
end
