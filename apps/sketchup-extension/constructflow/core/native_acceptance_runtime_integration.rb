# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module NativeAcceptanceRuntimeIntegration
        AUTOMATIC_CHECKPOINTS = %w[native_copy_identity observer_new_open scene_tag_persistence layout_pdf_export].freeze

        module_function

        def install(runtime)
          service = NativeAcceptanceService.new(runtime: runtime)
          install_runtime_accessor(runtime, service)
          register_commands(runtime, service)
          collector = NativeAcceptanceAutoEvidence.new(runtime: runtime, service: service).install
          install_collector_accessor(runtime, collector)
          install_menu(runtime, service)
          service
        end

        def install_runtime_accessor(runtime, service)
          runtime.singleton_class.class_eval do
            attr_accessor :native_acceptance unless method_defined?(:native_acceptance)
          end
          runtime.native_acceptance = service
        end

        def install_collector_accessor(runtime, collector)
          runtime.singleton_class.class_eval do
            attr_accessor :native_acceptance_auto_evidence unless method_defined?(:native_acceptance_auto_evidence)
          end
          runtime.native_acceptance_auto_evidence = collector
        end

        def register_commands(runtime, service)
          unless runtime.commands.registered?('RunNativeAcceptancePreflight')
            runtime.commands.register(
              'RunNativeAcceptancePreflight',
              owner_module: 'constructflow.core',
              validator: ->(_command) { [] }
            ) do |command|
              input = command[:input] || {}
              result = service.preflight(extension_id: input[:extension_id] || input['extension_id'])
              warnings = Array(result['warnings'])
              unless result['ready']
                warnings = ["native acceptance preflight failed: #{result['failed_checks'].join(', ')}", *warnings]
              end
              {
                warnings: warnings,
                events: [{
                  name: 'NativeAcceptancePreflightCompleted',
                  payload: {
                    ready: result['ready'],
                    extension_id: result['extension_id'],
                    failed_checks: result['failed_checks'],
                    coverage: result['coverage']
                  }
                }]
              }
            end
          end

          unless runtime.commands.registered?('CaptureNativeAcceptanceBaseline')
            runtime.commands.register(
              'CaptureNativeAcceptanceBaseline',
              owner_module: 'constructflow.core',
              validator: ->(_command) { [] }
            ) do |command|
              input = command[:input] || {}
              result = service.capture_baseline(extension_id: input[:extension_id] || input['extension_id'])
              baseline = result['baseline'] || {}
              {
                events: [{
                  name: 'NativeAcceptanceBaselineCaptured',
                  payload: {
                    fingerprint: result['baseline_fingerprint'],
                    extension_id: result['extension_id'],
                    model_path: baseline['model_path'],
                    smart_object_count: Array(baseline['smart_object_ids']).length,
                    scene_count: Array(baseline['scene_names']).length,
                    managed_tag_count: Array(baseline['managed_tag_names']).length
                  }
                }]
              }
            end
          end

          unless runtime.commands.registered?('VerifyNativeAcceptanceReopen')
            runtime.commands.register(
              'VerifyNativeAcceptanceReopen',
              owner_module: 'constructflow.core',
              validator: ->(_command) { [] }
            ) do |_command|
              result = service.verify_reopen
              evidence = result['evidence'] || {}
              warnings = []
              warnings << result['message'] unless result['passed']
              unless (result['presentation_differences'] || {}).empty?
                warnings << 'native scene/tag presentation differs from the captured baseline'
              end
              {
                warnings: warnings,
                events: [{
                  name: 'NativeAcceptanceReopenVerified',
                  payload: {
                    status: result['status'],
                    passed: result['passed'],
                    message: result['message'],
                    differences: result['differences'],
                    presentation_differences: result['presentation_differences'],
                    baseline_fingerprint: evidence['baseline_fingerprint'],
                    current_fingerprint: evidence['current_fingerprint']
                  }
                }]
              }
            end
          end

          unless runtime.commands.registered?('RecordNativeAcceptanceCheckpoint')
            runtime.commands.register(
              'RecordNativeAcceptanceCheckpoint',
              owner_module: 'constructflow.core',
              validator: lambda { |command|
                input = command[:input] || {}
                checkpoint_id = (input[:checkpoint_id] || input['checkpoint_id']).to_s
                status = (input[:status] || input['status']).to_s
                errors = []
                errors << 'checkpoint_id required' if checkpoint_id.strip.empty?
                errors << 'status required' if status.strip.empty?
                if status == 'passed' && AUTOMATIC_CHECKPOINTS.include?(checkpoint_id)
                  errors << "#{checkpoint_id} is passed only from native runtime evidence"
                end
                errors
              }
            ) do |command|
              input = command[:input] || {}
              checkpoint_id = input[:checkpoint_id] || input['checkpoint_id']
              status = input[:status] || input['status']
              result = service.record_checkpoint(
                checkpoint_id: checkpoint_id,
                status: status,
                notes: input[:notes] || input['notes'] || '',
                evidence: input[:evidence] || input['evidence'] || {}
              )
              checkpoint = result.dig('checkpoints', checkpoint_id.to_s) || {}
              {
                events: [{
                  name: 'NativeAcceptanceCheckpointRecorded',
                  payload: {
                    checkpoint_id: checkpoint_id.to_s,
                    status: checkpoint['status'],
                    notes: checkpoint['notes'],
                    recorded_at: checkpoint['recorded_at']
                  }
                }]
              }
            end
          end
        end

        def install_menu(runtime, service)
          return unless runtime.respond_to?(:menu) && runtime.menu
          return unless defined?(UI)

          submenu = runtime.menu.add_submenu('Native Acceptance')
          submenu.add_item('Preflight Acceptance Project') do
            begin
              UI.messagebox(preflight_message(service.preflight))
            rescue StandardError => error
              UI.messagebox("Native acceptance preflight failed:\n#{error.message}")
            end
          end
          submenu.add_item('Capture Save/Reopen Baseline') do
            begin
              result = service.capture_baseline
              UI.messagebox("Native acceptance baseline captured.\nFingerprint: #{result['baseline_fingerprint']}")
            rescue StandardError => error
              UI.messagebox("Native acceptance baseline failed:\n#{error.message}")
            end
          end
          submenu.add_item('Verify Save/Reopen') do
            begin
              result = service.verify_reopen
              scene_status = service.summary.dig('checkpoints', 'scene_tag_persistence', 'status')
              UI.messagebox(
                "Save/Reopen verification: #{result['status']}\n#{result['message']}\nScene/Tag persistence: #{scene_status}"
              )
            rescue StandardError => error
              UI.messagebox("Save/Reopen verification failed:\n#{error.message}")
            end
          end
          submenu.add_item('Show Native Acceptance Status') do
            summary = service.summary
            UI.messagebox(status_message(summary))
          end
        end

        def preflight_message(result)
          lines = [
            'ConstructFlow Native Acceptance Preflight',
            "Ready: #{result['ready'] ? 'YES' : 'NO'}"
          ]
          unless result['failed_checks'].empty?
            lines << "Fix: #{result['failed_checks'].join(', ')}"
          end
          unless result['warnings'].empty?
            lines << "Warnings: #{result['warnings'].join('; ')}"
          end
          lines.join("\n")
        end

        def status_message(summary)
          lines = [
            'ConstructFlow Native Acceptance',
            "Complete: #{summary['complete'] ? 'YES' : 'NO'}",
            "Passed: #{summary['passed'].length}/#{NativeAcceptanceEvidenceStore::REQUIRED_CHECKPOINTS.length}"
          ]
          unless summary['failed'].empty?
            lines << "Failed: #{summary['failed'].join(', ')}"
          end
          unless summary['pending'].empty?
            lines << "Pending: #{summary['pending'].join(', ')}"
          end
          lines.join("\n")
        end
      end
    end
  end
end
