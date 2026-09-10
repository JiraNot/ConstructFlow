# frozen_string_literal: true

require_relative 'existing_conflict_scan'
require_relative 'construction_output_settlement'
require_relative 'construction_issue_history_store'

module JiraNot
  module ConstructFlow
    module Extension
      class ConstructionWorkflowRunner
        def initialize(runtime:)
          @runtime = runtime
          @repository = Repository.new
          @intent_store = ConstructionIntentStore.new
          @issue_history_store = ConstructionIssueHistoryStore.new(runtime: runtime)
        end

        def run(extension_id:, domains: {}, revision: 'P01', issue_status: 'working', strict: false,
                refresh_drawings: true, export: nil, actor: { kind: 'automation' }, project_id: nil,
                project_name: '', project_number: '', drawn_by: '', checked_by: '',
                template_scope_id: '', template_use_case: 'construction', dry_run: false)
          extension = resolve_extension(extension_id)
          definition = @repository.read(extension.entity)
          raise ArgumentError, 'extension definition missing' unless definition

          runtime_overrides = stringify_keys(domains || {})
          persisted_intent = @intent_store.read(extension.entity)
          effective_overrides = @intent_store.effective_domains(extension.entity, runtime_overrides)
          intent_trace = {
            'schema_version' => persisted_intent['schema_version'],
            'persisted_domains' => persisted_intent['domains'],
            'run_overrides' => runtime_overrides.freeze,
            'effective_domain_overrides' => effective_overrides
          }.freeze

          plan_options = {
            'extension_id' => extension.id,
            'domains' => effective_overrides
          }
          plan = @runtime.extension_plan(definition, plan_options)
          execution = @runtime.execute_extension(
            plan,
            dry_run: dry_run == true,
            actor: actor,
            project_id: project_id || @runtime.project&.project_id
          )

          if dry_run
            return {
              'format' => 'constructflow.extension_construction_workflow.v1',
              'extension_id' => extension.id,
              'status' => 'preview',
              'construction_intent' => intent_trace,
              'execution' => execution,
              'conflict_scan' => nil,
              'quality_gate' => nil,
              'takeoff' => nil,
              'drawing_refresh' => [].freeze,
              'output_settlement' => nil,
              'currentness' => nil,
              'issue_set' => nil,
              'export' => nil,
              'output_state' => nil,
              'issue_history_entry' => nil
            }.freeze
          end

          conflict_scan = ExistingConflictScan.new(runtime: @runtime).run(extension_id: extension.id)
          takeoff = ConstructionTakeoff.new(runtime: @runtime).build(extension.id)
          quality = ConstructionQualityGate.new(runtime: @runtime).run(
            extension_id: extension.id,
            execution: execution,
            takeoff: takeoff,
            conflict_scan: conflict_scan,
            strict: strict == true
          )

          issue_factory = ConstructionIssueSetFactory.new(runtime: @runtime)
          issue_set = issue_factory.build(
            extension_id: extension.id,
            revision: revision,
            issue_status: issue_status,
            project_name: project_name,
            project_number: project_number,
            drawn_by: drawn_by,
            checked_by: checked_by,
            template_scope_id: template_scope_id,
            template_use_case: template_use_case
          )
          drawing_refresh = refresh_drawings ? refresh_issue_scenes(issue_set, extension.id, issue_factory) : []
          settlement_service = ConstructionOutputSettlement.new(runtime: @runtime)
          output_settlement = settlement_service.settle(
            extension_id: extension.id,
            takeoff: takeoff,
            issue_set: issue_set,
            drawing_refresh: drawing_refresh,
            drawings_required: !export.nil?
          )
          currentness = ConstructionCurrentnessAudit.new(runtime: @runtime, issue_factory: issue_factory).run(
            extension_id: extension.id,
            takeoff: takeoff,
            drawing_refresh: drawing_refresh,
            drawings_required: !export.nil?
          )
          issue_plan = @runtime.drawing_issue_sets.build(issue_set)
          export_result = nil
          if export && quality['publishable'] && output_settlement['publishable'] && currentness['publishable']
            export_result = export_issue_set(issue_set, stringify_keys(export))
          end
          status = workflow_status(
            execution,
            quality,
            output_settlement,
            currentness,
            export_result,
            export_requested: !export.nil?
          )
          output_state = settlement_service.record(
            extension_id: extension.id,
            settlement: output_settlement,
            currentness: currentness,
            revision: revision,
            issue_status: issue_status,
            export_requested: !export.nil?,
            export_result: export_result
          )
          issue_history_entry = if status == 'exported'
                                  @issue_history_store.record(
                                    extension_id: extension.id,
                                    revision: revision,
                                    issue_status: issue_status,
                                    settlement: output_settlement,
                                    currentness: currentness,
                                    export_result: export_result
                                  )
                                end

          {
            'format' => 'constructflow.extension_construction_workflow.v1',
            'extension_id' => extension.id,
            'status' => status,
            'construction_intent' => intent_trace,
            'execution' => execution,
            'conflict_scan' => conflict_scan,
            'quality_gate' => quality,
            'takeoff' => takeoff,
            'drawing_refresh' => drawing_refresh.freeze,
            'output_settlement' => output_settlement,
            'currentness' => currentness,
            'issue_set' => issue_plan,
            'export' => export_result,
            'output_state' => output_state,
            'issue_history_entry' => issue_history_entry
          }.freeze
        end

        private

        def resolve_extension(extension_id)
          object = @runtime.smart_objects.fetch_by_id(extension_id.to_s)
          return object if object && object.type == 'extension.zone' && object.owner_module == 'constructflow.extension'
          raise ArgumentError, 'extension zone not found'
        end

        def refresh_issue_scenes(issue_set, extension_id, issue_factory)
          issue_set.sheets.map do |request|
            family = request.preset_id.to_s.split('.').first
            object_ids = issue_factory.object_ids_for_family(extension_id: extension_id, family: family)
            result = @runtime.plan_scenes.refresh_preset(request.preset_id, object_ids: object_ids)
            {
              'preset_id' => request.preset_id,
              'scene_name' => result['scene_name'],
              'source_object_ids' => object_ids,
              'rendered_count' => result['rendered_count'],
              'rendered_object_ids' => result['rendered_object_ids']
            }.freeze
          end
        end

        def export_issue_set(issue_set, options)
          layout_path = options['layout_path'].to_s
          raise ArgumentError, 'export.layout_path required' if layout_path.empty?

          @runtime.native_layout_issue_sets.export(
            issue_set,
            layout_path: layout_path,
            pdf_path: blank_to_nil(options['pdf_path']),
            skp_path: blank_to_nil(options['skp_path']),
            template_path: blank_to_nil(options['template_path']),
            template_key: blank_to_nil(options['template_key']),
            template_version: blank_to_nil(options['template_version']),
            verify_template_asset: options.key?('verify_template_asset') ? options['verify_template_asset'] == true : true
          )
        end

        def workflow_status(execution, quality, settlement, currentness, export_result, export_requested:)
          return 'blocked' unless execution['status'] == 'success' && quality['publishable'] && settlement['publishable'] && currentness['publishable']
          return 'ready' unless export_requested
          return 'export_failed' if export_result.nil?
          'exported'
        end

        def stringify_keys(value)
          case value
          when Hash
            value.each_with_object({}) { |(key, item), result| result[key.to_s] = stringify_keys(item) }
          when Array
            value.map { |item| stringify_keys(item) }
          else
            value
          end
        end

        def blank_to_nil(value)
          text = value.to_s
          text.empty? ? nil : value
        end
      end
    end
  end
end
