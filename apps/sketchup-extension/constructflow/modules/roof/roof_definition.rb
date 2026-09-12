# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      class RoofDefinition
        SCHEMA_VERSION = 1
        FORMS = %w[lean_to flat gable hip].freeze
        COVERINGS = %w[generic metal_sheet tile polycarbonate glass].freeze

        attr_reader :boundary_mm, :roof_form, :slope_percent, :slope_direction_xy,
                    :low_elevation_mm, :covering_system, :thickness_mm,
                    :generated_from_id

        def initialize(boundary_mm:, roof_form: 'lean_to', slope_percent: 5.0,
                       slope_direction_xy: [0, 1], low_elevation_mm: nil,
                       covering_system: 'metal_sheet', thickness_mm: 20,
                       generated_from_id: nil)
          @boundary_mm = normalize_boundary(boundary_mm).freeze
          @roof_form = roof_form.to_s
          @slope_percent = Float(slope_percent)
          @slope_direction_xy = normalize_direction(slope_direction_xy).freeze
          @low_elevation_mm = low_elevation_mm.nil? ? default_low_elevation : Float(low_elevation_mm)
          @covering_system = covering_system.to_s
          @thickness_mm = Float(thickness_mm)
          @generated_from_id = generated_from_id&.to_s
          freeze
        end

        def errors
          result = []
          result << 'roof boundary requires at least three points' if boundary_mm.length < 3
          result << 'unsupported roof form' unless FORMS.include?(roof_form)
          result << 'unsupported roof covering system' unless COVERINGS.include?(covering_system)
          result << 'roof thickness must be greater than zero' unless thickness_mm.positive?
          result << 'roof slope cannot be negative' if slope_percent.negative?
          result << 'lean-to roof slope must be greater than zero' if roof_form == 'lean_to' && slope_percent <= 0
          result << 'roof boundary area must be greater than zero' if boundary_mm.length >= 3 && plan_area_mm2 <= 1.0
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def plan_area_mm2
          return 0.0 if boundary_mm.length < 3

          sum = boundary_mm.each_with_index.sum do |point, index|
            nxt = boundary_mm[(index + 1) % boundary_mm.length]
            (point[0] * nxt[1]) - (nxt[0] * point[1])
          end
          sum.abs / 2.0
        end

        def roof_area_mm2
          return facets_mm.sum { |facet| polygon_area_3d_mm2(facet) } if %w[gable hip].include?(roof_form)

          plan_area_mm2 * Math.sqrt(1.0 + ((slope_percent / 100.0)**2))
        end

        def sloped_points_mm
          return rectangular_eave_points_mm if %w[gable hip].include?(roof_form) && rectangular_boundary?

          min_projection = boundary_mm.map { |point| projection(point) }.min || 0.0
          boundary_mm.map do |point|
            rise = (projection(point) - min_projection) * (slope_percent / 100.0)
            [point[0], point[1], low_elevation_mm + rise].freeze
          end.freeze
        end

        # Returns the roof surface as planar facets so non-planar forms do not
        # rely on SketchUp accepting one non-planar polygon face.
        def facets_mm
          return [sloped_points_mm] unless rectangular_boundary? && %w[gable hip].include?(roof_form)

          x_min, x_max = boundary_mm.map { |point| point[0] }.minmax
          y_min, y_max = boundary_mm.map { |point| point[1] }.minmax
          z = low_elevation_mm
          if roof_form == 'gable'
            ridge_y = (y_min + y_max) / 2.0
            ridge_z = z + ((y_max - y_min).abs / 2.0) * slope_percent / 100.0
            [
              [[x_min, y_min, z], [x_max, y_min, z], [x_max, ridge_y, ridge_z], [x_min, ridge_y, ridge_z]],
              [[x_min, ridge_y, ridge_z], [x_max, ridge_y, ridge_z], [x_max, y_max, z], [x_min, y_max, z]]
            ].map { |facet| facet.map(&:freeze).freeze }.freeze
          else
            center = [(x_min + x_max) / 2.0, (y_min + y_max) / 2.0, z +
              [x_max - x_min, y_max - y_min].min.abs / 2.0 * slope_percent / 100.0]
            [
              [[x_min, y_min, z], [x_max, y_min, z], center],
              [[x_max, y_min, z], [x_max, y_max, z], center],
              [[x_max, y_max, z], [x_min, y_max, z], center],
              [[x_min, y_max, z], [x_min, y_min, z], center]
            ].map { |facet| facet.map(&:freeze).freeze }.freeze
          end
        end

        def perimeter_mm
          points = sloped_points_mm
          return 0.0 if points.length < 2

          points.each_with_index.sum do |point, index|
            nxt = points[(index + 1) % points.length]
            distance(point, nxt)
          end
        end

        def edge_points_mm(edge_index)
          points = sloped_points_mm
          raise ArgumentError, 'roof has no edges' if points.empty?

          index = Integer(edge_index)
          raise ArgumentError, 'roof edge index out of range' if index.negative? || index >= points.length

          [points[index], points[(index + 1) % points.length]].freeze
        end

        def with(boundary_mm: self.boundary_mm, roof_form: self.roof_form,
                 slope_percent: self.slope_percent, slope_direction_xy: self.slope_direction_xy,
                 low_elevation_mm: self.low_elevation_mm, covering_system: self.covering_system,
                 thickness_mm: self.thickness_mm, generated_from_id: self.generated_from_id)
          self.class.new(
            boundary_mm: boundary_mm,
            roof_form: roof_form,
            slope_percent: slope_percent,
            slope_direction_xy: slope_direction_xy,
            low_elevation_mm: low_elevation_mm,
            covering_system: covering_system,
            thickness_mm: thickness_mm,
            generated_from_id: generated_from_id
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'boundary_mm' => boundary_mm,
            'roof_form' => roof_form,
            'slope_percent' => slope_percent,
            'slope_direction_xy' => slope_direction_xy,
            'low_elevation_mm' => low_elevation_mm,
            'covering_system' => covering_system,
            'thickness_mm' => thickness_mm,
            'generated_from_id' => generated_from_id
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            boundary_mm: data['boundary_mm'] || data[:boundary_mm] || [],
            roof_form: data['roof_form'] || data[:roof_form] || 'lean_to',
            slope_percent: data['slope_percent'] || data[:slope_percent] || 5.0,
            slope_direction_xy: data['slope_direction_xy'] || data[:slope_direction_xy] || [0, 1],
            low_elevation_mm: data['low_elevation_mm'] || data[:low_elevation_mm],
            covering_system: data['covering_system'] || data[:covering_system] || 'metal_sheet',
            thickness_mm: data['thickness_mm'] || data[:thickness_mm] || 20,
            generated_from_id: data['generated_from_id'] || data[:generated_from_id]
          )
        end

        private

        def normalize_boundary(values)
          Array(values).map do |point|
            item = Array(point)
            raise ArgumentError, 'roof boundary point requires x, y, z' unless item.length >= 3

            [Float(item[0]), Float(item[1]), Float(item[2])].freeze
          end
        end

        def normalize_direction(values)
          item = Array(values)
          raise ArgumentError, 'slope direction requires x and y' unless item.length >= 2

          x = Float(item[0])
          y = Float(item[1])
          length = Math.sqrt((x * x) + (y * y))
          raise ArgumentError, 'slope direction cannot be zero' if length <= 1e-9

          [x / length, y / length]
        end

        def default_low_elevation
          boundary_mm.map { |point| point[2] }.min || 0.0
        end

        def projection(point)
          (point[0] * slope_direction_xy[0]) + (point[1] * slope_direction_xy[1])
        end

        def rectangular_boundary?
          return false unless boundary_mm.length == 4

          xs = boundary_mm.map { |point| point[0] }.uniq
          ys = boundary_mm.map { |point| point[1] }.uniq
          xs.length == 2 && ys.length == 2
        end

        def rectangular_eave_points_mm
          x_min, x_max = boundary_mm.map { |point| point[0] }.minmax
          y_min, y_max = boundary_mm.map { |point| point[1] }.minmax
          [[x_min, y_min, low_elevation_mm], [x_max, y_min, low_elevation_mm],
           [x_max, y_max, low_elevation_mm], [x_min, y_max, low_elevation_mm]].map(&:freeze).freeze
        end

        def distance(a, b)
          dx = b[0] - a[0]
          dy = b[1] - a[1]
          dz = b[2] - a[2]
          Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
        end

        def polygon_area_3d_mm2(points)
          first = points.first
          points.drop(1).each_cons(2).sum do |a, b|
            u = [a[0] - first[0], a[1] - first[1], a[2] - first[2]]
            v = [b[0] - first[0], b[1] - first[1], b[2] - first[2]]
            cross = [
              (u[1] * v[2]) - (u[2] * v[1]),
              (u[2] * v[0]) - (u[0] * v[2]),
              (u[0] * v[1]) - (u[1] * v[0])
            ]
            Math.sqrt(cross.sum { |value| value * value }) / 2.0
          end
        end
      end
    end
  end
end
