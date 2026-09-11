# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module NativeAcceptanceRuntimeIntegration
        module_function

        def install(runtime)
          service = NativeAcceptanceService.new(runtime: runtime)
          install_runtime_accessor(runtime, service)
          register_commands(runtime, service)
          install_menu(runtime, service)
          service
        end

        def install_runtime_accessor(runtime, service)
          runtime.singleton_class.class_eval do
            attr_accessor :native_acceptance unless method_defined?(:native_acceptance)
          end
          runtime.native_acceptance = service
        end

        def register_commands(runtime, service)
          unless runtime.commands.registered?('CaptureNativeAcceptanceBaseline')
            runtime.commands.register(
              'CaptureNativeAcceptanceBaseline',
              owner_module: 'constructflow.core',
              validator: ->(_command) { [] }
            ) do |command|
              input = command[:input] || {}
              result = service.capture_baseline(extension_id: input[:extension_id] || input['extension_id'])
              {
                events: [{ name: 'NativeAcceptanceBaselineCaptured', payload: { fingerprint: result['baseline_fingerprint'] } }],
                result: result
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
              {
                events: [{ name: 'NativeAcceptanceReopenVerified', payload: { status: result['status'] } }],
                result: result
              }
            end
          end

          unless runtime.commands.registered?('RecordNativeAcceptanceCheckpoint')
            runtime.commands.register(
              'RecordNativeAcceptanceCheckpoint',
              owner_module: 'constructflow.core',
              validator: lambda { |command|
                input = command[:input] || {}
                errors = []
                errors << 'checkpoint_id required' if (input[:checkpoint_id] || input['checkpoint_id']).to_s.strip.empty?
                errors << 'status required' if (input[:status] || input['status']).to_s.strip.empty?
                errors
              }
            ) do |command|
              input = command[:input] || {}
              result = service.record_checkpoint(
                checkpoint_id: input[:checkpoint_id] || input['checkpoint_id'],
                status: input[:status] || input['status'],
                notes: input[:notes] || input['notes'] || '',
                evidence: input[:evidence] || input['evidence'] || {}
              )
              {
                events: [{
                  name: 'NativeAcceptanceCheckpointRecorded',
                  payload: {
                    checkpoint_id: input[:checkpoint_id] || input['checkpoint_id'],
                    status: input[:status] || input['status']
                  }
                }],
                result: result
              }
            end
          end
        end

        def install_menu(runtime, service)
          return unless runtime.respond_to?(:menu) && runtime.menu
          return unless defined?(UI)

          submenu = runtime.menu.add_submenu('Native Acceptance')
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
              UI.messagebox("Save/Reopen verification: #{result['status']}\n#{result['message']}")
            rescue StandardError => error
              UI.messagebox("Save/Reopen verification failed:\n#{error.message}")
            end
          end
          submenu.add_item('Show Native Acceptance Status') do
            summary = service.summary
            UI.messagebox(status_message(summary))
          end
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
