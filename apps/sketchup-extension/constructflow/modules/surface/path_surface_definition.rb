# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      class PathSurfaceDefinition
        SCHEMA_VERSION = 1
        EPSILON = 1.0e-6

        attr_reader :centerline_mm, :width_mm, :surface_type, :base_elevation_mm

        def initialize(centerline_mm:, width_mm: 1200.0, surface_type: 'paver',
                       base_elevation_mm: 0.0)
          @centerline_mm = normalize_centerline(centerline_mm).freeze
          @width_mm = Float(width_mm)
          @surface_type = surface_type.to_s
          @base_elevation_mm = Float(base_elevation_mm)
          freeze
        end

        def errors
          result = []
          result << 'path centerline requires at least two points' if centerline_mm.length < 2
          result << 'path width must be positive' unless width_mm.positive?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def length_mm
          return 0.0 if centerline_mm.length < 2

          centerline_mm.each_cons(2).sum do |p1, p2|
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            dz = p2[2] - p1[2]
            Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
          end
        end

        def compute_boundary_loop
          return [] if centerline_mm.length < 2

          half_w = width_mm / 2.0
          left_pts = []
          right_pts = []

          # Compute normals for each segment
          normals = []
          centerline_mm.each_cons(2) do |p1, p2|
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            len = Math.sqrt((dx * dx) + (dy * dy))
            if len <= EPSILON
              normals << [0.0, 1.0]
            else
              normals << [-dy / len, dx / len]
            end
          end

          # Vertex normals: average adjacent segment normals
          centerline_mm.each_with_index do |pt, i|
            nx, ny = if i.zero?
                       normals.first
                     elsif i == centerline_mm.length - 1
                       normals.last
                     else
                       n1 = normals[i - 1]
                       n2 = normals[i]
                       avg_x = (n1[0] + n2[0]) / 2.0
                       avg_y = (n1[1] + n2[1]) / 2.0
                       mag = Math.sqrt((avg_x * avg_x) + (avg_y * avg_y))
                       mag > EPSILON ? [avg_x / mag, avg_y / mag] : n1
                     end

            left_pts << [pt[0] + (nx * half_w), pt[1] + (ny * half_w), pt[2]]
            right_pts << [pt[0] - (nx * half_w), pt[1] - (ny * half_w), pt[2]]
          end

          left_pts + right_pts.reverse
        end

        def to_surface_definition
          SurfaceDefinition.new(
            outer_boundary_mm: compute_boundary_loop,
            surface_type: surface_type,
            base_elevation_mm: base_elevation_mm
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'centerline_mm' => centerline_mm,
            'width_mm' => width_mm,
            'surface_type' => surface_type,
            'base_elevation_mm' => base_elevation_mm
          }
        end

        def self.from_h(data)
          return nil unless data.is_a?(Hash)

          new(
            centerline_mm: data['centerline_mm'] || data[:centerline_mm] || [],
            width_mm: data['width_mm'] || data[:width_mm] || 1200.0,
            surface_type: data['surface_type'] || data[:surface_type] || 'paver',
            base_elevation_mm: data['base_elevation_mm'] || data[:base_elevation_mm] || 0.0
          )
        end

        private

        def normalize_centerline(pts)
          Array(pts).map do |p|
            arr = Array(p)
            [Float(arr[0] || 0.0), Float(arr[1] || 0.0), Float(arr[2] || 0.0)]
          end
        end
      end
    end
  end
end
