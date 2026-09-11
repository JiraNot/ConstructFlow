# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Converts objective events emitted by real SketchUp/LayOut runtime
      # integration into model-local native-acceptance evidence. It deliberately
      # ignores CI and source-review state; an acceptance baseline must exist.
      class NativeAcceptanceAutoEvidence
        COPY_CHECKPOINT = 'native_copy_identity'
        OBSERVER_CHECKPOINT = 'observer_new_open'
        LAYOUT_CHECKPOINT = 'layout_pdf_export'

        def initialize(runtime:, service:)
          @runtime = runtime
          @service = service
          @subscriptions = []
          @new_model_transition = nil
        end

        def install
          @subscriptions << @runtime.events.subscribe(
            'NativeCopyIdentityRepaired', owner: 'constructflow.core.native_acceptance'
          ) { |event| record_native_copy(event) }
          @subscriptions << @runtime.events.subscribe(
            'SketchupModelAttached', owner: 'constructflow.core.native_acceptance'
          ) { |event| record_model_transition(event) }
          @subscriptions << @runtime.events.subscribe(
            'NativeLayoutExportCompleted', owner: 'constructflow.core.native_acceptance'
          ) { |event| record_layout_export(event) }
          self
        end

        private

        def record_native_copy(event)
          session = active_acceptance_session
          return unless session

          baseline = session['baseline'] || {}
          return unless current_model_matches?(baseline)

          repairs = Array(event.dig(:payload, :repairs) || event.dig(:payload, 'repairs'))
          return if repairs.empty?

          normalized = repairs.map { |repair| deep_stringify(repair) }
          return unless normalized.all? { |repair| valid_copy_repair?(repair) }

          @service.record_checkpoint(
            checkpoint_id: COPY_CHECKPOINT,
            status: 'passed',
            notes: 'Native SketchUp copy received a new detached Smart Object identity.',
            evidence: runtime_evidence(event).merge(
              'evidence_source' => 'native_runtime_event',
              'repairs' => normalized
            )
          )
        rescue StandardError => error
          diagnostic('native_acceptance_copy_evidence_failed', error)
        end

        def record_model_transition(event)
          target = @service.acceptance_target
          return unless target

          payload = deep_stringify(event[:payload] || {})
          return unless payload['source'] == 'app_observer'

          transition = payload['transition'].to_s
          if transition == 'new'
            return if target_match?(target, payload)

            @new_model_transition = transition_evidence(event, payload)
            return
          end

          return unless transition == 'open'
          return unless @new_model_transition
          return unless target_match?(target, payload)

          session = active_acceptance_session
          return unless session && current_model_matches?(session['baseline'] || {})

          @service.record_checkpoint(
            checkpoint_id: OBSERVER_CHECKPOINT,
            status: 'passed',
            notes: 'Runtime followed native SketchUp New Model then Open Model and reattached the acceptance project.',
            evidence: {
              'evidence_source' => 'native_runtime_event',
              'new_model' => @new_model_transition,
              'reopened_model' => transition_evidence(event, payload),
              'application_version' => sketchup_version
            }
          )
          @new_model_transition = nil
        rescue StandardError => error
          diagnostic('native_acceptance_observer_evidence_failed', error)
        end

        def record_layout_export(event)
          session = active_acceptance_session
          return unless session

          baseline = session['baseline'] || {}
          return unless current_model_matches?(baseline)

          payload = deep_stringify(event[:payload] || {})
          return unless valid_layout_export?(payload, baseline)

          layout_path = payload['layout_path'].to_s
          pdf_path = payload['pdf_path'].to_s
          template = payload['template_resolution'].is_a?(Hash) ? payload['template_resolution'] : {}
          evidence = runtime_evidence(event).merge(
            'evidence_source' => 'native_runtime_event',
            'export_kind' => payload['export_kind'].to_s,
            'native_backend' => payload['native_backend'].to_s,
            'skp_path' => payload['skp_path'].to_s,
            'layout_path' => layout_path,
            'layout_bytes' => file_size(layout_path),
            'pdf_path' => pdf_path,
            'pdf_bytes' => file_size(pdf_path),
            'issue_set_id' => payload['issue_set_id'].to_s,
            'preset_id' => payload['preset_id'].to_s,
            'sheet_count' => payload['sheet_count'].to_i,
            'viewport_count' => payload['viewport_count'].to_i,
            'template_resolution' => template
          )
          @service.record_checkpoint(
            checkpoint_id: LAYOUT_CHECKPOINT,
            status: 'passed',
            notes: 'Native LayOut Ruby API created a template-backed .layout document and PDF output.',
            evidence: evidence
          )
        rescue StandardError => error
          diagnostic('native_acceptance_layout_evidence_failed', error)
        end

        def active_acceptance_session
          session = @service.session
          baseline = session['baseline']
          baseline.is_a?(Hash) ? session : nil
        rescue StandardError
          nil
        end

        def current_model_matches?(baseline)
          model = @runtime.active_model
          return false unless model

          model_path = model.respond_to?(:path) ? model.path.to_s : ''
          project_id = @runtime.project&.project_id.to_s
          model_path == baseline['model_path'].to_s && project_id == baseline['project_id'].to_s
        end

        def valid_copy_repair?(repair)
          source_id = repair['source_object_id'].to_s
          new_id = repair['new_object_id'].to_s
          return false if source_id.empty? || new_id.empty? || source_id == new_id
          return false unless repair['relationships_detached'] == true

          manager = @runtime.smart_objects
          source = manager.fetch_by_id(source_id)
          copied = manager.fetch_by_id(new_id)
          !source.nil? && !copied.nil?
        end

        def valid_layout_export?(payload, baseline)
          return false unless payload['native_backend'].to_s == 'layout_ruby_api'
          return false unless payload['skp_path'].to_s == baseline['model_path'].to_s

          layout_path = payload['layout_path'].to_s
          pdf_path = payload['pdf_path'].to_s
          return false unless valid_output_file?(layout_path, '.layout')
          return false unless valid_output_file?(pdf_path, '.pdf')

          template = payload['template_resolution']
          return false unless template.is_a?(Hash)
          template_path = template['path'].to_s
          return false if template_path.empty?
          return false unless File.file?(template_path)

          true
        rescue StandardError
          false
        end

        def valid_output_file?(path, extension)
          !path.empty? && File.extname(path).downcase == extension && File.file?(path) && File.size(path).positive?
        rescue StandardError
          false
        end

        def file_size(path)
          File.size(path.to_s)
        rescue StandardError
          0
        end

        def target_match?(target, payload)
          payload['model_path'].to_s == target['model_path'].to_s &&
            payload['project_id'].to_s == target['project_id'].to_s
        end

        def transition_evidence(event, payload)
          {
            'event_id' => event[:event_id].to_s,
            'timestamp' => event[:timestamp].to_s,
            'transition' => payload['transition'].to_s,
            'model_path' => payload['model_path'].to_s,
            'project_id' => payload['project_id'].to_s,
            'smart_object_count' => payload['smart_object_count'].to_i
          }.freeze
        end

        def runtime_evidence(event)
          model = @runtime.active_model
          {
            'event_id' => event[:event_id].to_s,
            'timestamp' => event[:timestamp].to_s,
            'model_path' => (model && model.respond_to?(:path) ? model.path.to_s : ''),
            'project_id' => @runtime.project&.project_id.to_s,
            'application_version' => sketchup_version
          }
        end

        def sketchup_version
          return Sketchup.version.to_s if defined?(Sketchup) && Sketchup.respond_to?(:version)

          ''
        rescue StandardError
          ''
        end

        def deep_stringify(value)
          case value
          when Hash
            value.each_with_object({}) { |(key, item), result| result[key.to_s] = deep_stringify(item) }
          when Array
            value.map { |item| deep_stringify(item) }
          else
            value
          end
        end

        def diagnostic(code, error)
          @runtime.diagnostics&.error(
            code,
            "Native acceptance auto-evidence failed: #{error.message}",
            error_class: error.class.name
          )
        end
      end
    end
  end
end
