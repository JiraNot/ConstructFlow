# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Shared semantic boundary for every MEP network, regardless of discipline.
      # Geometry and discipline-specific definitions stay in their modules; topology
      # must still speak the same source/destination/system language.
      class MepSemanticContract
        REQUIRED_CONNECTION_FIELDS = %w[from_connector_id to_connector_id system].freeze
        METADATA_FIELDS = %w[source_object_id destination_object_id flow load].freeze

        def self.validate_connection(from_connector:, to_connector:, system:, metadata: {})
          errors = []
          errors << 'source connector required' if from_connector.nil?
          errors << 'destination connector required' if to_connector.nil?
          errors << 'MEP system required' if system.to_s.strip.empty?
          errors << 'source and destination connectors must differ' if from_connector && to_connector &&
            from_connector['id'].to_s == to_connector['id'].to_s
          errors.concat(validate_metadata(metadata))
          errors.freeze
        end

        def self.validate_metadata(metadata)
          values = metadata || {}
          errors = []
          %w[source_object_id destination_object_id].each do |key|
            errors << "#{key} cannot be blank" if values.key?(key) && values[key].to_s.strip.empty?
          end
          errors
        end

        def self.normalize_metadata(metadata)
          (metadata || {}).each_with_object({}) do |(key, value), result|
            result[key.to_s] = value
          end
        end

        def self.semantic_metadata(metadata)
          normalized = normalize_metadata(metadata)
          METADATA_FIELDS.each_with_object({}) do |key, result|
            result[key] = normalized[key] if normalized.key?(key)
          end
        end
      end
    end
  end
end
