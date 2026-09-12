# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      class SlopeDefinition
        SCHEMA_VERSION = 1
        SLOPE_MODES = %w[planar multi_point drain_to].freeze
        EPSILON = 1.0e-6

        attr_reader :slope_mode, :control_points, :slope_percentage,
                    :slope_direction_deg, :drain_target_id, :target_point_mm,
                    :target_elevation_mm

        def initialize(slope_mode: 'planar', control_points: [], slope_percentage: 1.0,
                       slope_direction_deg: 0.0, drain_target_id: nil,
                       target_point_mm: nil, target_elevation_mm: 0.0)
          @slope_mode = slope_mode.to_s
          @control_points = Array(control_points).map { |cp| normalize_control_point(cp) }.freeze
          @slope_percentage = Float(slope_percentage || 0.0)
          @slope_direction_deg = Float(slope_direction_deg || 0.0)
          @drain_target_id = drain_target_id&.to_s
          @target_point_mm = target_point_mm ? normalize_point(target_point_mm).freeze : nil
          @target_elevation_mm = Float(target_elevation_mm || 0.0)
          freeze
        end

        def errors
          result = []
          result << 'unsupported slope mode' unless SLOPE_MODES.include?(slope_mode)
          case slope_mode
          when 'planar'
            if control_points.length >= 3 && collinear?(control_points.map { |cp| cp['point_mm'] })
              result << 'control points are collinear; cannot define a planar slope'
            end
          when 'multi_point'
            result << 'multi-point slope requires at least 3 control points' if control_points.length < 3
            if control_points.length >= 3 && collinear?(control_points.map { |cp| cp['point_mm'] })
              result << 'control points are collinear; cannot interpolate multi-point slope'
            end
          when 'drain_to'
            result << 'drain target id or target point required' if (drain_target_id.nil? || drain_target_id.empty?) && target_point_mm.nil?
            result << 'slope percentage must be positive for drain-to slope' if slope_percentage <= 0.0
          end
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def elevation_at(point_mm)
          pt = [Float(point_mm[0]), Float(point_mm[1])]
          case slope_mode
          when 'drain_to'
            center = target_point_mm || [0.0, 0.0, target_elevation_mm]
            dx = pt[0] - center[0]
            dy = pt[1] - center[1]
            dist = Math.sqrt((dx * dx) + (dy * dy))
            slope_ratio = slope_percentage / 100.0
            (target_point_mm ? target_point_mm[2] : target_elevation_mm) + (dist * slope_ratio)
          when 'planar'
            if control_points.length >= 3
              interpolate_plane(pt, control_points[0..2])
            else
              # Base elevation + slope along direction
              rad = slope_direction_deg * Math::PI / 180.0
              dir_x = Math.cos(rad)
              dir_y = Math.sin(rad)
              proj = (pt[0] * dir_x) + (pt[1] * dir_y)
              slope_ratio = slope_percentage / 100.0
              target_elevation_mm - (proj * slope_ratio)
            end
          when 'multi_point'
            interpolate_multi_point(pt, control_points)
          else
            target_elevation_mm
          end
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'slope_mode' => slope_mode,
            'control_points' => control_points,
            'slope_percentage' => slope_percentage,
            'slope_direction_deg' => slope_direction_deg,
            'drain_target_id' => drain_target_id,
            'target_point_mm' => target_point_mm,
            'target_elevation_mm' => target_elevation_mm
          }
        end

        def self.from_h(data)
          return nil unless data.is_a?(Hash)

          new(
            slope_mode: data['slope_mode'] || 'planar',
            control_points: data['control_points'] || [],
            slope_percentage: data['slope_percentage'] || 1.0,
            slope_direction_deg: data['slope_direction_deg'] || 0.0,
            drain_target_id: data['drain_target_id'],
            target_point_mm: data['target_point_mm'],
            target_elevation_mm: data['target_elevation_mm'] || 0.0
          )
        end

        private

        def normalize_point(point)
          [Float(point[0]), Float(point[1]), Float(point[2] || 0.0)]
        end

        def normalize_control_point(cp)
          if cp.is_a?(Hash)
            pt = normalize_point(cp['point_mm'] || cp[:point_mm] || [0, 0, 0])
            elev = Float(cp['elevation_mm'] || cp[:elevation_mm] || pt[2])
            { 'point_mm' => pt, 'elevation_mm' => elev }
          elsif cp.is_a?(Array)
            pt = normalize_point(cp)
            { 'point_mm' => pt, 'elevation_mm' => pt[2] }
          else
            { 'point_mm' => [0.0, 0.0, 0.0], 'elevation_mm' => 0.0 }
          end
        end

        def collinear?(points)
          return false if points.length < 3

          p1, p2, p3 = points[0], points[1], points[2]
          cross_z = ((p2[0] - p1[0]) * (p3[1] - p1[1])) - ((p2[1] - p1[1]) * (p3[0] - p1[0]))
          cross_z.abs <= EPSILON
        end

        def interpolate_plane(pt, pts)
          p1 = pts[0]['point_mm'].dup
          p1[2] = pts[0]['elevation_mm']
          p2 = pts[1]['point_mm'].dup
          p2[2] = pts[1]['elevation_mm']
          p3 = pts[2]['point_mm'].dup
          p3[2] = pts[2]['elevation_mm']

          # Plane normal N = (p2 - p1) x (p3 - p1)
          v1 = [p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]]
          v2 = [p3[0] - p1[0], p3[1] - p1[1], p3[2] - p1[2]]
          nx = (v1[1] * v2[2]) - (v1[2] * v2[1])
          ny = (v1[2] * v2[0]) - (v1[0] * v2[2])
          nz = (v1[0] * v2[1]) - (v1[1] * v2[0])

          return p1[2] if nz.abs <= EPSILON

          # nx*(x - p1x) + ny*(y - p1y) + nz*(z - p1z) = 0
          # z = p1z - (nx*(x - p1x) + ny*(y - p1y)) / nz
          p1[2] - (((nx * (pt[0] - p1[0])) + (ny * (pt[1] - p1[1]))) / nz)
        end

        def interpolate_multi_point(pt, points)
          # Inverse distance weighting (IDW)
          weights = points.map do |cp|
            c_pt = cp['point_mm']
            dx = pt[0] - c_pt[0]
            dy = pt[1] - c_pt[1]
            dist_sq = (dx * dx) + (dy * dy)
            return cp['elevation_mm'] if dist_sq <= EPSILON

            1.0 / dist_sq
          end

          total_weight = weights.sum
          return target_elevation_mm if total_weight <= EPSILON

          sum_elev = points.each_with_index.sum do |cp, idx|
            weights[idx] * cp['elevation_mm']
          end
          sum_elev / total_weight
        end
      end
    end
  end
end
