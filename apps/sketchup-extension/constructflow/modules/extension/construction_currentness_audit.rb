# frozen_string_literal: true

require 'digest'

module JiraNot
  module ConstructFlow
    module Extension
      class ConstructionCurrentnessAudit
        FORMAT = 'constructflow.extension_construction_currentness.v1'
        PRESET_FAMILIES = ConstructionIssueSetFactory::PRESETS.invert.freeze

        def initialize(runtime:, issue_factory: nil)
          @runtime = runtime
          @issue_factory = issue_factory || ConstructionIssueSetFactory.new(runtime: runtime)
        end

        def run(extension_id:, takeoff:, drawing_refresh: [], drawings_required: false)
          source = resolve_extension(extension_id)
          current_scope = current_takeoff_scope(source)
          current_scope_ids = current_scope.map { |object| object.id.to_s }.sort.freeze
          indexed_ids = @runtime.smart_objects.all.map { |object| object.id.to_s }.freeze

          coverage_ids = Array(takeoff && takeoff['coverage']).map { |item| item['object_id'].to_s }.reject(&:empty?).uniq.sort.freeze
          missing_takeoff_ids = (current_scope_ids - coverage_ids).freeze
          foreign_takeoff_ids = (coverage_ids - current_scope_ids).freeze

          drawing_checks = Array(drawing_refresh).map do |entry|
            drawing_check(source.id, entry, indexed_ids)
          end.freeze
          drawing_stale_ids = drawing_checks.flat_map { |item| item['stale_object_ids'] }.uniq.sort.freeze
          drawing_foreign_ids = drawing_checks.flat_map { |item| item['foreign_object_ids'] }.uniq.sort.freeze
          drawing_scope_mismatches = drawing_checks.select { |item| item['scope_match'] == false }.map { |item| item['preset_id'] }.freeze

          issues = []
          issues << issue('construction.takeoff.scope_missing', 'error', missing_takeoff_ids) unless missing_takeoff_ids.empty?
          issues << issue('construction.takeoff.scope_foreign', 'error', foreign_takeoff_ids) unless foreign_takeoff_ids.empty?
          issues << issue('construction.drawing.stale_reference', 'error', drawing_stale_ids) unless drawing_stale_ids.empty?
          issues << issue('construction.drawing.foreign_reference', 'error', drawing_foreign_ids) unless drawing_foreign_ids.empty?
          issues << issue('construction.drawing.scope_mismatch', 'error', drawing_scope_mismatches) unless drawing_scope_mismatches.empty?
          if drawings_required && drawing_checks.empty?
            issues << {
              'rule_id' => 'construction.drawing.refresh_required',
              'severity' => 'error',
              'message' => 'construction publication requires drawing scenes refreshed from the current Smart Object scope'
            }.freeze
          end

          errors = issues.select { |item| item['severity'] == 'error' }
          {
            'format' => FORMAT,
            'extension_id' => source.id,
            'status' => errors.empty? ? 'current' : 'stale',
            'publishable' => errors.empty?,
            'scope_fingerprint' => fingerprint(current_scope),
            'current_scope_object_ids' => current_scope_ids,
            'takeoff_coverage_object_ids' => coverage_ids,
            'missing_takeoff_object_ids' => missing_takeoff_ids,
            'foreign_takeoff_object_ids' => foreign_takeoff_ids,
            'drawing_checks' => drawing_checks,
            'issues' => issues.freeze
          }.freeze
        end

        private

        def resolve_extension(extension_id)
          object = @runtime.smart_objects.fetch_by_id(extension_id.to_s)
          return object if object && object.type == 'extension.zone' && object.owner_module == 'constructflow.extension'
          raise ArgumentError, 'extension zone not found'
        end

        def current_takeoff_scope(source)
          values = [source]
          @runtime.smart_objects.all.each do |object|
            next if object.id.to_s == source.id.to_s
            values << object if generated_from?(object, source.id)
          end
          values.uniq { |object| object.id.to_s }.sort_by { |object| object.id.to_s }.freeze
        end

        def generated_from?(object, extension_id)
          Array(object.relationships).any? do |relationship|
            (relationship['kind'] || relationship[:kind]).to_s == 'generated_from' &&
              (relationship['target_id'] || relationship[:target_id]).to_s == extension_id.to_s
          end
        end

        def drawing_check(extension_id, entry, indexed_ids)
          preset_id = entry['preset_id'].to_s
          family = PRESET_FAMILIES[preset_id] || preset_id.split('.').first
          expected = @issue_factory.object_ids_for_family(extension_id: extension_id, family: family)
          requested = Array(entry['source_object_ids']).map(&:to_s).reject(&:empty?).uniq.sort
          rendered = Array(entry['rendered_object_ids']).map(&:to_s).reject(&:empty?).uniq.sort
          stale = (rendered - indexed_ids).sort
          foreign = (rendered - expected).sort
          {
            'preset_id' => preset_id,
            'family' => family,
            'expected_object_ids' => expected,
            'requested_object_ids' => requested.freeze,
            'rendered_object_ids' => rendered.freeze,
            'scope_match' => requested == expected,
            'stale_object_ids' => stale.freeze,
            'foreign_object_ids' => foreign.freeze
          }.freeze
        rescue KeyError
          {
            'preset_id' => preset_id,
            'family' => family,
            'expected_object_ids' => [].freeze,
            'requested_object_ids' => Array(entry['source_object_ids']).map(&:to_s).freeze,
            'rendered_object_ids' => Array(entry['rendered_object_ids']).map(&:to_s).freeze,
            'scope_match' => false,
            'stale_object_ids' => [].freeze,
            'foreign_object_ids' => [].freeze
          }.freeze
        end

        def fingerprint(objects)
          payload = Array(objects).map do |object|
            [
              object.id.to_s,
              object.type.to_s,
              object.owner_module.to_s,
              object.created_phase.to_s,
              object.removed_phase.to_s,
              object.source_state.to_s,
              object.respond_to?(:updated_at) ? object.updated_at.to_s : ''
            ].join('|')
          end.join("\n")
          Digest::SHA256.hexdigest(payload)
        end

        def issue(rule_id, severity, values)
          {
            'rule_id' => rule_id,
            'severity' => severity,
            'message' => "#{rule_id}: #{Array(values).join(', ')}",
            'object_ids' => Array(values).map(&:to_s).freeze
          }.freeze
        end
      end
    end
  end
end
