# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      class RoofJunctionDefinition
        SCHEMA_VERSION = 1
        JUNCTION_TYPES = %w[new_roof_to_existing_wall].freeze
        FLASHING_PROFILES = %w[wall_apron counter_flashing custom].freeze
        MATERIALS = %w[metal aluminium stainless_steel custom].freeze

        attr_reader :roof_object_id, :host_object_id, :edge_index, :path_mm,
                    :junction_type, :flashing_profile, :material,
                    :upstand_mm, :cover_mm

        def initialize(roof_object_id:, host_object_id:, edge_index:, path_mm:,
                       junction_type: 'new_roof_to_existing_wall',
                       flashing_profile: 'wall_apron', material: 'metal',
                       upstand_mm: 150, cover_mm: 150)
          @roof_object_id = roof_object_id.to_s
          @host_object_id = host_object_id.to_s
          @edge_index = Integer(edge_index)
          @path_mm = normalize_path(path_mm).freeze
          @junction_type = junction_type.to_s
          @flashing_profile = flashing_profile.to_s
          @material = material.to_s
          @upstand_mm = Float(upstand_mm)
          @cover_mm = Float(cover_mm)
          freeze
        end

        def errors
          result = []
          result << 'roof junction roof_object_id required' if roof_object_id.strip.empty?
          result << 'roof junction host_object_id required' if host_object_id.strip.empty?
          result << 'roof junction edge_index cannot be negative' if edge_index.negative?
          result << 'roof junction path requires exactly two points' unless path_mm.length == 2
          result << 'roof junction path length must be greater than zero' if path_mm.length == 2 && length_mm <= 0.001
          result << 'unsupported roof junction type' unless JUNCTION_TYPES.include?(junction_type)
          result << 'unsupported flashing profile' unless FLASHING_PROFILES.include?(flashing_profile)
          result << 'unsupported roof junction material' unless MATERIALS.include?(material)
          result << 'roof flashing upstand must be greater than zero' unless upstand_mm.positive?
          result << 'roof flashing cover must be greater than zero' unless cover_mm.positive?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def length_mm
          return 0.0 unless path_mm.length == 2
          a, b = path_mm
          dx = b[0] - a[0]
          dy = b[1] - a[1]
          dz = b[2] - a[2]
          Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'roof_object_id' => roof_object_id,
            'host_object_id' => host_object_id,
            'edge_index' => edge_index,
            'path_mm' => path_mm,
            'junction_type' => junction_type,
            'flashing_profile' => flashing_profile,
            'material' => material,
            'upstand_mm' => upstand_mm,
            'cover_mm' => cover_mm
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            roof_object_id: data['roof_object_id'] || data[:roof_object_id],
            host_object_id: data['host_object_id'] || data[:host_object_id],
            edge_index: data['edge_index'] || data[:edge_index] || 0,
            path_mm: data['path_mm'] || data[:path_mm] || [],
            junction_type: data['junction_type'] || data[:junction_type] || 'new_roof_to_existing_wall',
            flashing_profile: data['flashing_profile'] || data[:flashing_profile] || 'wall_apron',
            material: data['material'] || data[:material] || 'metal',
            upstand_mm: data['upstand_mm'] || data[:upstand_mm] || 150,
            cover_mm: data['cover_mm'] || data[:cover_mm] || 150
          )
        end

        private

        def normalize_path(values)
          Array(values).map do |point|
            item = Array(point)
            raise ArgumentError, 'roof junction path point requires x, y, z' unless item.length >= 3
            [Float(item[0]), Float(item[1]), Float(item[2])].freeze
          end
        end
      end
    end
  end
end
