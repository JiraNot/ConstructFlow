# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      module ConstructionWorkflowRegistration
        COMMAND = 'RunExtensionConstructionWorkflow'

        module_function

        def install(runtime)
          runner = ConstructionWorkflowRunner.new(runtime: runtime)
          install_runtime_helper(runtime, runner)
          install_command(runtime, runner)
          install_ui(runtime, runner)
          runner
        end

        def install_runtime_helper(runtime, runner)
          singleton = class << runtime; self; end
          return if singleton.method_defined?(:construction_workflows)
          singleton.send(:define_method, :construction_workflows) { runner }
        end

        def install_command(runtime, runner)
          return if runtime.commands.registered?(COMMAND)
          runtime.commands.register(COMMAND, owner_module: 'constructflow.extension', transaction: false) do |command|
            input = command[:input]
            result = runner.run(
              extension_id: value(input, :extension_id),
              domains: value(input, :domains) || {},
              revision: value(input, :revision) || 'P01',
              issue_status: value(input, :issue_status) || 'working',
              strict: value(input, :strict) == true,
              refresh_drawings: value_or(input, :refresh_drawings, true),
              export: value(input, :export),
              actor: command[:actor],
              project_id: command[:project_id],
              project_name: value(input, :project_name) || '',
              project_number: value(input, :project_number) || '',
              drawn_by: value(input, :drawn_by) || '',
              checked_by: value(input, :checked_by) || '',
              template_scope_id: value(input, :template_scope_id) || '',
              template_use_case: value(input, :template_use_case) || 'construction',
              dry_run: value(input, :dry_run) == true
            )
            warnings = Array(result.dig('quality_gate', 'issues')).select { |issue| issue['severity'] == 'warning' }
                           .map { |issue| issue['message'] }
            warnings.concat(
              Array(result.dig('currentness', 'issues')).map { |issue| issue['message'] }
            )
            warnings << 'construction workflow is blocked by generation, QA, or package currentness' if result['status'] == 'blocked'
            {
              warnings: warnings.uniq,
              events: [{ name: 'ConstructionWorkflowCompleted', object_ids: [result['extension_id']], payload: result }]
            }
          end
        end

        def install_ui(runtime, runner)
          menu = runtime.respond_to?(:menu) ? runtime.menu : nil
          return unless menu && menu.respond_to?(:add_submenu)
          return if runtime.instance_variable_defined?(:@construction_workflow_ui_installed)

          submenu = menu.add_submenu('Construction Workflow')
          submenu.add_item('Build Package from Selected Extension') do
            extension = selected_extension(runtime)
            unless extension
              UI.messagebox('Select one ConstructFlow extension zone first.') if defined?(UI)
              next
            end
            values = UI.inputbox(
              ['Revision', 'Issue status', 'Strict QA?'],
              ['P01', 'working', 'No'],
              'ConstructFlow Construction Package'
            )
            next unless values
            strict = values[2].to_s.strip.downcase.start_with?('y')
            result = runner.run(
              extension_id: extension.id,
              revision: values[0].to_s,
              issue_status: values[1].to_s,
              strict: strict,
              refresh_drawings: true,
              actor: { kind: 'human' },
              project_id: runtime.project&.project_id
            )
            if defined?(UI)
              qa = result['quality_gate'] || {}
              currentness = result['currentness'] || {}
              UI.messagebox(
                "Construction workflow: #{result['status']}\n" \
                "QA: #{qa['status']} (#{qa['error_count']} errors / #{qa['warning_count']} warnings)\n" \
                "Currentness: #{currentness['status']}\n" \
                "Takeoff items: #{result.dig('takeoff', 'item_count')}\n" \
                "Sheets: #{result.dig('issue_set', 'sheet_count')}"
              )
            end
          rescue StandardError => error
            UI.messagebox("ConstructFlow Construction Workflow failed: #{error.message}") if defined?(UI)
          end
          runtime.instance_variable_set(:@construction_workflow_ui_installed, true)
        end

        def selected_extension(runtime)
          return nil unless runtime.active_model.respond_to?(:selection)
          runtime.active_model.selection.filter_map do |entity|
            object = runtime.smart_objects.fetch(entity)
            object if object && object.type == 'extension.zone' && object.owner_module == 'constructflow.extension'
          end.first
        end

        def value(input, key)
          input[key] || input[key.to_s]
        end

        def value_or(input, key, default)
          return input[key] if input.key?(key)
          return input[key.to_s] if input.key?(key.to_s)
          default
        end
      end
    end
  end
end
