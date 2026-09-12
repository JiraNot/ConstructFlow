# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Costing
      class EstimateSnapshot
        SCHEMA_VERSION = 1

        attr_reader :snapshot_id, :estimate_id, :rate_library_id,
                    :rate_library_version, :project_revision, :timestamp,
                    :total_cost, :currency, :estimate_payload

        def initialize(snapshot_id:, estimate_id:, rate_library_id:,
                       rate_library_version:, project_revision: 1,
                       timestamp: Time.now.iso8601, total_cost:,
                       currency: 'THB', estimate_payload: {})
          @snapshot_id = snapshot_id.to_s.strip
          @estimate_id = estimate_id.to_s.strip
          @rate_library_id = rate_library_id.to_s.strip
          @rate_library_version = rate_library_version.to_s.strip
          @project_revision = project_revision
          @timestamp = timestamp.to_s.strip
          @total_cost = Float(total_cost)
          @currency = currency.to_s.strip.upcase
          @estimate_payload = normalize_hash(estimate_payload).freeze
          freeze
        end

        def errors
          result = []
          result << 'snapshot id required' if snapshot_id.empty?
          result << 'estimate id required' if estimate_id.empty?
          result << 'rate library id required' if rate_library_id.empty?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'snapshot_id' => snapshot_id,
            'estimate_id' => estimate_id,
            'rate_library_id' => rate_library_id,
            'rate_library_version' => rate_library_version,
            'project_revision' => project_revision,
            'timestamp' => timestamp,
            'total_cost' => total_cost,
            'currency' => currency,
            'estimate_payload' => estimate_payload
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            snapshot_id: data['snapshot_id'] || data[:snapshot_id],
            estimate_id: data['estimate_id'] || data[:estimate_id],
            rate_library_id: data['rate_library_id'] || data[:rate_library_id],
            rate_library_version: data['rate_library_version'] || data[:rate_library_version],
            project_revision: data['project_revision'] || data[:project_revision] || 1,
            timestamp: data['timestamp'] || data[:timestamp] || Time.now.iso8601,
            total_cost: data['total_cost'] || data[:total_cost] || 0.0,
            currency: data['currency'] || data[:currency] || 'THB',
            estimate_payload: data['estimate_payload'] || data[:estimate_payload] || {}
          )
        end

        private

        def normalize_hash(h)
          return {} unless h.is_a?(Hash)

          h.each_with_object({}) do |(k, v), res|
            res[k.to_s] = v.is_a?(Hash) ? normalize_hash(v).freeze : v
          end
        end
      end
    end
  end
end
