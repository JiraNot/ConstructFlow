# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      class ConstructionQualityGate
        RISK_SOURCE_STATES = %w[assumed unknown verify_on_site].freeze
        APPROVED_STRUCTURE_STATUSES = %w[engineer_approved as_built].freeze

        def initialize(runtime:)
          @runtime = runtime
          @structure_repository = Structure::Repository.new
        end

        def run(extension_id:, execution:, takeoff: nil, conflict_scan: nil, strict: false)
          source = @runtime.smart_objects.fetch_by_id(extension_id.to_s)
          raise ArgumentError, 'extension zone not found' unless source && source.type == 'extension.zone'

          ids = related_ids(source)
          issues = []
          issues.concat(execution_issues(execution))
          issues.concat(source_state_issues(ids, strict: strict))
          issues.concat(structure_approval_issues(ids, strict: strict))
          issues.concat(existing_conflict_issues(conflict_scan, strict: strict)) if conflict_scan
          issues.concat(drainage_completeness_issues(ids, execution, strict: strict))
          issues.concat(drainage_issues(ids))
          issues.concat(takeoff_issues(takeoff)) if takeoff
          issues = unique_issues(issues)
          errors = issues.select { |issue| issue['severity'] == 'error' }
          warnings = issues.select { |issue| issue['severity'] == 'warning' }

          {
            'format' => 'constructflow.extension_construction_quality_gate.v1',
            'extension_id' => source.id,
            'strict' => strict == true,
            'status' => errors.empty? ? (warnings.empty? ? 'clear' : 'warning') : 'error',
            'publishable' => errors.empty?,
            'issue_count' => issues.length,
            'error_count' => errors.length,
            'warning_count' => warnings.length,
            'issues' => issues.freeze
          }.freeze
        end

        private

        def related_ids(source)
          ids = [source.id]
          @runtime.smart_objects.all.each do |object|
            next unless generated_from?(object, source.id)
            ids << object.id
          end
          ids.uniq.freeze
        end

        def generated_from?(object, extension_id)
          Array(object.relationships).any? do |relationship|
            (relationship['kind'] || relationship[:kind]).to_s == 'generated_from' &&
              (relationship['target_id'] || relationship[:target_id]).to_s == extension_id.to_s
          end
        end

        def execution_issues(execution)
          result = []
          status = execution && execution['status'].to_s
          if status != 'success'
            result << issue('construction.execution.not_current', 'error', nil, "extension execution status is #{status.empty? ? 'missing' : status}")
          end
          Array(execution && execution['steps']).each do |step|
            domain = step['domain'].to_s
            Array(step['errors']).each do |message|
              result << issue("construction.#{domain}.execution", 'error', nil, message, domain: domain)
            end
            Array(step['warnings']).each do |message|
              result << issue("construction.#{domain}.warning", 'warning', nil, message, domain: domain)
            end
          end
          Array(execution && execution['dirty_domains']).each do |domain|
            result << issue('construction.domain.dirty', 'error', nil, "#{domain} is not current after extension execution", domain: domain)
          end
          result
        end

        def source_state_issues(ids, strict:)
          ids.filter_map do |id|
            object = @runtime.smart_objects.fetch_by_id(id)
            next unless object && RISK_SOURCE_STATES.include?(object.source_state.to_s)
            severity = strict ? 'error' : 'warning'
            issue(
              'construction.source_state.review_required', severity, object,
              "#{object.type} source state is #{object.source_state}; review required before final issue"
            )
          end
        end

        def structure_approval_issues(ids, strict:)
          ids.filter_map do |id|
            object = @runtime.smart_objects.fetch_by_id(id)
            next unless object && object.owner_module == 'constructflow.structure'
            definition = case object.type
                         when 'structure.column' then @structure_repository.read_column(object.entity)
                         when 'structure.foundation' then @structure_repository.read_foundation(object.entity)
                         end
            next unless definition && definition.respond_to?(:engineering_status)
            next if APPROVED_STRUCTURE_STATUSES.include?(definition.engineering_status.to_s)

            issue(
              'construction.structure.engineering_status', strict ? 'error' : 'warning', object,
              "#{object.type} engineering status is #{definition.engineering_status}; engineer approval required before construction issue",
              engineering_status: definition.engineering_status
            )
          rescue StandardError => error
            issue(
              'construction.structure.definition_review_failed', 'error', object,
              "structure approval check failed: #{error.message}"
            )
          end
        end

        def existing_conflict_issues(conflict_scan, strict:)
          Array(conflict_scan && conflict_scan['conflicts']).map do |conflict|
            object = @runtime.smart_objects.fetch_by_id(conflict['object_id'].to_s)
            issue(
              conflict['rule_id'] || 'extension.existing_conflict.unresolved',
              strict ? 'error' : 'warning',
              object,
              conflict['message'] || 'existing construction conflicts with Extension footprint',
              domain: conflict['domain'],
              conflict_kind: conflict['conflict_kind'],
              state: conflict['state'],
              evidence: conflict['evidence']
            )
          end
        end

        def drainage_completeness_issues(ids, execution, strict:)
          drainage_step = Array(execution && execution['steps']).find { |step| step['domain'].to_s == 'drainage' }
          return [] unless drainage_step
          config = drainage_step.dig('intent', 'config') || {}
          return [] if config.is_a?(Hash) && config.key?('enabled') && config['enabled'] == false

          has_drainage = ids.any? do |id|
            object = @runtime.smart_objects.fetch_by_id(id)
            object && object.owner_module == 'constructflow.drainage'
          end
          return [] if has_drainage

          [issue(
            'construction.drainage.unresolved_intent', strict ? 'error' : 'warning', nil,
            'drainage is enabled but no extension drainage Smart Object is resolved; explicit network endpoints are required before final issue',
            domain: 'drainage'
          )]
        end

        def drainage_issues(ids)
          return [] unless defined?(Drainage::NetworkAudit)
          audit = Drainage::NetworkAudit.new(runtime: @runtime).run
          Array(audit['issues']).filter_map do |value|
            next unless ids.include?(value['object_id'].to_s)
            issue(
              value['rule_id'] || 'construction.drainage.qa',
              value['severity'] || 'warning',
              @runtime.smart_objects.fetch_by_id(value['object_id'].to_s),
              value['message'],
              state: value['state'], evidence: value['evidence']
            )
          end
        rescue StandardError => error
          [issue('construction.drainage.audit_failed', 'error', nil, "drainage audit failed: #{error.message}")]
        end

        def takeoff_issues(takeoff)
          Array(takeoff && takeoff['coverage']).filter_map do |coverage|
            status = coverage['status'].to_s
            next if %w[included unsupported_type].include?(status)
            severity = status == 'missing_definition' ? 'error' : 'warning'
            issue(
              'construction.takeoff.coverage', severity,
              @runtime.smart_objects.fetch_by_id(coverage['object_id'].to_s),
              "quantity coverage is #{status} for #{coverage['object_type']}"
            )
          end
        end

        def issue(rule_id, severity, object, message, extra = {})
          {
            'rule_id' => rule_id.to_s,
            'severity' => severity.to_s,
            'message' => message.to_s,
            'object_id' => object&.id,
            'object_type' => object&.type
          }.merge(extra.reject { |_key, value| value.nil? }.transform_keys(&:to_s)).freeze
        end

        def unique_issues(values)
          seen = {}
          Array(values).each_with_object([]) do |value, result|
            key = [value['rule_id'], value['severity'], value['object_id'], value['message']]
            next if seen[key]
            seen[key] = true
            result << value
          end
        end
      end
    end
  end
end
