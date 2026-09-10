# frozen_string_literal: true

require 'digest'
require 'time'

module JiraNot
  module ConstructFlow
    module Extension
      class ConstructionIssueHistoryStore
        DICTIONARY = 'constructflow.extension'
        KEY = 'construction_issue_history'
        SCHEMA_VERSION = 1
        FORMAT = 'constructflow.extension_construction_issue_history.v1'

        def initialize(runtime:)
          @runtime = runtime
        end

        def read(extension_id)
          source = resolve_extension(extension_id)
          payload = Core::AttributeStore.new(source.entity).read_json(KEY, nil, dictionary: DICTIONARY)
          normalize_payload(payload)
        end

        def latest(extension_id)
          read(extension_id).fetch('entries').last
        end

        def record(extension_id:, revision:, issue_status:, settlement:, currentness:, export_result:)
          raise ArgumentError, 'successful export result required for construction issue history' unless export_result
          source = resolve_extension(extension_id)
          payload = read(source.id)
          candidate = build_entry(
            source: source,
            revision: revision,
            issue_status: issue_status,
            settlement: settlement,
            currentness: currentness,
            export_result: export_result
          )
          existing = payload.fetch('entries').find { |entry| entry['issue_id'].to_s == candidate['issue_id'] }
          return existing if existing

          updated = {
            'format' => FORMAT,
            'schema_version' => SCHEMA_VERSION,
            'extension_id' => source.id.to_s,
            'entries' => (payload.fetch('entries') + [candidate]).freeze
          }.freeze
          Core::AttributeStore.new(source.entity).write_json(KEY, updated, dictionary: DICTIONARY)
          candidate
        end

        private

        def build_entry(source:, revision:, issue_status:, settlement:, currentness:, export_result:)
          evidence = {
            'extension_id' => source.id.to_s,
            'revision' => required(revision, 'revision'),
            'issue_status' => required(issue_status, 'issue status'),
            'scope_fingerprint' => currentness && currentness['scope_fingerprint'].to_s,
            'takeoff_fingerprint' => settlement && settlement['takeoff_fingerprint'].to_s,
            'drawing_fingerprint' => settlement && settlement['drawing_fingerprint'].to_s,
            'settlement_status' => settlement && settlement['status'].to_s,
            'currentness_status' => currentness && currentness['status'].to_s,
            'layout_path' => export_result['layout_path'].to_s,
            'pdf_path' => export_result['pdf_path']&.to_s,
            'native_backend' => export_result['native_backend'].to_s,
            'template' => template_trace(export_result)
          }
          validate_publishable_evidence!(settlement, currentness, evidence)
          digest_payload = canonical_digest_payload(evidence)
          evidence.merge(
            'issue_id' => "issue-#{Digest::SHA256.hexdigest(digest_payload)[0, 20]}",
            'recorded_at' => Time.now.utc.iso8601
          ).freeze
        end

        def validate_publishable_evidence!(settlement, currentness, evidence)
          raise ArgumentError, 'settled output required for issue history' unless settlement && settlement['publishable'] == true
          raise ArgumentError, 'current package required for issue history' unless currentness && currentness['publishable'] == true
          raise ArgumentError, 'LayOut path required for issue history' if evidence['layout_path'].to_s.empty?
        end

        def template_trace(export_result)
          trace = export_result['template_resolution'] || {}
          {
            'source' => trace['source'].to_s,
            'key' => trace['key'].to_s,
            'version' => trace['version'].to_s,
            'sha256' => trace['sha256'].to_s,
            'asset_verified' => trace['asset_verified'] == true
          }.freeze
        end

        def canonical_digest_payload(entry)
          template = entry.fetch('template')
          [
            entry['extension_id'], entry['revision'], entry['issue_status'],
            entry['scope_fingerprint'], entry['takeoff_fingerprint'], entry['drawing_fingerprint'],
            entry['layout_path'], entry['pdf_path'], entry['native_backend'],
            template['source'], template['key'], template['version'], template['sha256'], template['asset_verified']
          ].map(&:to_s).join('|')
        end

        def normalize_payload(payload)
          return empty_payload if payload.nil?
          data = stringify_keys(payload)
          version = Integer(data['schema_version'] || 1)
          raise ArgumentError, "unsupported construction issue history schema version: #{version}" unless version == SCHEMA_VERSION
          entries = Array(data['entries']).map { |entry| stringify_keys(entry).freeze }.freeze
          {
            'format' => data['format'].to_s.empty? ? FORMAT : data['format'].to_s,
            'schema_version' => SCHEMA_VERSION,
            'extension_id' => data['extension_id'].to_s,
            'entries' => entries
          }.freeze
        rescue TypeError, ArgumentError => error
          raise ArgumentError, "invalid construction issue history: #{error.message}"
        end

        def empty_payload
          {
            'format' => FORMAT,
            'schema_version' => SCHEMA_VERSION,
            'extension_id' => '',
            'entries' => [].freeze
          }.freeze
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

        def required(value, label)
          text = value.to_s.strip
          raise ArgumentError, "#{label} required" if text.empty?
          text
        end

        def resolve_extension(extension_id)
          object = @runtime.smart_objects.fetch_by_id(extension_id.to_s)
          return object if object && object.type == 'extension.zone' && object.owner_module == 'constructflow.extension'
          raise ArgumentError, 'extension zone not found'
        end
      end
    end
  end
end
