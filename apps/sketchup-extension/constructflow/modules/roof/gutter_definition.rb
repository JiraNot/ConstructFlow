# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      class GutterDefinition
        SCHEMA_VERSION = 1

        attr_reader :roof_object_id, :edge_index, :profile_id, :outlet_ratio,
                    :outlet_connector_id

        def initialize(roof_object_id:, edge_index:, profile_id: 'generic.gutter',
                       outlet_ratio: 1.0, outlet_connector_id: nil)
          @roof_object_id = roof_object_id.to_s
          @edge_index = Integer(edge_index)
          @profile_id = profile_id.to_s
          @outlet_ratio = Float(outlet_ratio)
          @outlet_connector_id = outlet_connector_id&.to_s
          freeze
        end

        def errors
          result = []
          result << 'roof object id required' if roof_object_id.empty?
          result << 'gutter edge index cannot be negative' if edge_index.negative?
          result << 'gutter outlet ratio must be between 0 and 1' unless outlet_ratio.between?(0.0, 1.0)
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def with(roof_object_id: self.roof_object_id, edge_index: self.edge_index,
                 profile_id: self.profile_id, outlet_ratio: self.outlet_ratio,
                 outlet_connector_id: self.outlet_connector_id)
          self.class.new(
            roof_object_id: roof_object_id,
            edge_index: edge_index,
            profile_id: profile_id,
            outlet_ratio: outlet_ratio,
            outlet_connector_id: outlet_connector_id
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'roof_object_id' => roof_object_id,
            'edge_index' => edge_index,
            'profile_id' => profile_id,
            'outlet_ratio' => outlet_ratio,
            'outlet_connector_id' => outlet_connector_id
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            roof_object_id: data['roof_object_id'] || data[:roof_object_id],
            edge_index: data['edge_index'] || data[:edge_index] || 0,
            profile_id: data['profile_id'] || data[:profile_id] || 'generic.gutter',
            outlet_ratio: data.key?('outlet_ratio') ? data['outlet_ratio'] : (data[:outlet_ratio] || 1.0),
            outlet_connector_id: data['outlet_connector_id'] || data[:outlet_connector_id]
          )
        end
      end
    end
  end
end
