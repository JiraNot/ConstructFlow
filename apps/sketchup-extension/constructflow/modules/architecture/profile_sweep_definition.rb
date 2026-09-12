# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class ProfileSweepDefinition
        SCHEMA_VERSION = 1

        attr_reader :path_mm, :profile_code, :profile_points_mm, :anchor,
                    :material, :level_id, :base_elevation_mm

        def initialize(path_mm:, profile_code: 'SKIRT-100x15', profile_points_mm: nil,
                       anchor: :bottom_left, material: 'wood', level_id: nil, base_elevation_mm: 0)
          @path_mm = normalize_path(path_mm).freeze
          @profile_code = profile_code.to_s
          @anchor = (anchor || :bottom_left).to_sym
          @material = material.to_s
          @level_id = level_id&.to_s
          @base_elevation_mm = Float(base_elevation_mm)

          # If custom profile points not provided, resolve from catalog
          resolved_pts = profile_points_mm || default_profile_points(@profile_code)
          @profile_points_mm = normalize_profile(resolved_pts).freeze
          freeze
        end

        def errors
          result = []
          result << 'sweep path requires at least two points' unless path_mm.length >= 2
          result << 'profile requires at least three 2D points' unless profile_points_mm.length >= 3
          result
        end

        def valid?
          errors.empty?
        end

        def total_length_m
          total_length_mm / 1000.0
        end

        def total_length_mm
          path_mm.each_cons(2).sum do |p1, p2|
            Math.sqrt(((p2[0] - p1[0])**2) + ((p2[1] - p1[1])**2) + ((p2[2] - p1[2])**2))
          end
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'path_mm' => path_mm,
            'profile_code' => profile_code,
            'profile_points_mm' => profile_points_mm,
            'anchor' => anchor.to_s,
            'material' => material,
            'level_id' => level_id,
            'base_elevation_mm' => base_elevation_mm,
            'total_length_mm' => total_length_mm
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            path_mm: data['path_mm'] || data[:path_mm] || [],
            profile_code: data['profile_code'] || data[:profile_code] || 'SKIRT-100x15',
            profile_points_mm: data['profile_points_mm'] || data[:profile_points_mm],
            anchor: data['anchor'] || data[:anchor] || :bottom_left,
            material: data['material'] || data[:material] || 'wood',
            level_id: data['level_id'] || data[:level_id],
            base_elevation_mm: data['base_elevation_mm'] || data[:base_elevation_mm] || 0
          )
        end

        private

        def normalize_path(value)
          Array(value).map do |point|
            vals = Array(point)
            raise ArgumentError, 'path point requires x, y, z' unless vals.length >= 3
            [Float(vals[0]), Float(vals[1]), Float(vals[2])].freeze
          end
        end

        def normalize_profile(value)
          Array(value).map do |pt|
            vals = Array(pt)
            raise ArgumentError, 'profile point requires u, v' unless vals.length >= 2
            [Float(vals[0]), Float(vals[1])].freeze
          end
        end

        def default_profile_points(code)
          catalog_entry = Core::StructuralProfileCatalog.find_profile(code) rescue nil
          if catalog_entry
            w = catalog_entry[:width_mm] || 15.0
            h = catalog_entry[:depth_mm] || 100.0
            # 2D rectangle profile
            [[0.0, 0.0], [w, 0.0], [w, h], [0.0, h]]
          else
            # Default 100x15 mm skirting
            [[0.0, 0.0], [15.0, 0.0], [15.0, 100.0], [0.0, 100.0]]
          end
        end
      end
    end
  end
end
