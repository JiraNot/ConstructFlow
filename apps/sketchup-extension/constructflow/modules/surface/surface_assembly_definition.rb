# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      class SurfaceAssemblyDefinition
        SCHEMA_VERSION = 1

        attr_reader :id, :name, :layers, :description

        def initialize(id:, name:, layers: [], description: nil)
          @id = id.to_s
          @name = name.to_s
          @layers = Array(layers).map { |layer| normalize_layer(layer) }.freeze
          @description = description&.to_s
          freeze
        end

        def errors
          result = []
          result << 'assembly id required' if id.empty?
          result << 'assembly name required' if name.empty?
          result << 'assembly requires at least one layer' if layers.empty?
          layers.each_with_index do |layer, index|
            result << "layer #{index + 1} name required" if layer['name'].to_s.empty?
            result << "layer #{index + 1} thickness must be positive" unless layer['thickness_mm'].positive?
          end
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def total_thickness_mm
          layers.sum { |layer| layer['thickness_mm'] }
        end

        def total_finish_thickness_mm
          surface_owned_layers.sum { |layer| layer['thickness_mm'] }
        end

        def surface_owned_layers
          layers.select { |layer| layer['owned_by_surface'] }
        end

        def structural_layers
          layers.reject { |layer| layer['owned_by_surface'] }
        end

        def layer_count
          layers.length
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'id' => id,
            'name' => name,
            'layers' => layers,
            'description' => description
          }
        end

        def self.from_h(data)
          return nil unless data.is_a?(Hash)

          new(
            id: data['id'] || data[:id],
            name: data['name'] || data[:name] || 'Surface Assembly',
            layers: data['layers'] || data[:layers] || [],
            description: data['description'] || data[:description]
          )
        end

        private

        def normalize_layer(layer)
          data = layer.is_a?(Hash) ? layer : {}
          {
            'name' => (data['name'] || data[:name] || 'Layer').to_s,
            'thickness_mm' => Float(data['thickness_mm'] || data[:thickness_mm] || 0.0),
            'material_id' => (data['material_id'] || data[:material_id] || 'generic').to_s,
            'owned_by_surface' => data.fetch('owned_by_surface', data.fetch(:owned_by_surface, true)),
            'layer_type' => (data['layer_type'] || data[:layer_type] || 'finish').to_s
          }
        end
      end
    end
  end
end
