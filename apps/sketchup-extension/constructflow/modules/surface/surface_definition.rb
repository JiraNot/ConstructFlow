# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      class SurfaceDefinition
        SCHEMA_VERSION = 1
        SURFACE_TYPES = %w[tile paver stamped_concrete stone deck concrete generic].freeze

        attr_reader :outer_boundary_mm, :holes_mm, :surface_type, :base_level_id,
                    :base_elevation_mm, :assembly_id, :drain_target_id, :slope_definition

        def initialize(outer_boundary_mm:, holes_mm: [], surface_type: 'generic',
                       base_level_id: nil, base_elevation_mm: 0,
                       assembly_id: nil, drain_target_id: nil, slope_definition: nil)
          @outer_boundary_mm = normalize_loop(outer_boundary_mm).freeze
          @holes_mm = Array(holes_mm).map { |loop| normalize_loop(loop).freeze }.freeze
          @surface_type = surface_type.to_s
          @base_level_id = base_level_id&.to_s
          @base_elevation_mm = Float(base_elevation_mm)
          @assembly_id = assembly_id&.to_s
          @drain_target_id = drain_target_id&.to_s
          @slope_definition = if slope_definition.is_a?(Hash)
                                SlopeDefinition.from_h(slope_definition)
                              else
                                slope_definition
                              end
          freeze
        end

        def errors
          result = []
          result << 'surface boundary requires at least three points' if outer_boundary_mm.length < 3
          result << 'surface boundary is self-intersecting' if outer_boundary_mm.length >= 4 && self_intersecting?(outer_boundary_mm)
          result << 'surface outer area must be greater than zero' if outer_boundary_mm.length >= 3 && outer_area_mm2 <= 1.0
          result << 'unsupported surface type' unless SURFACE_TYPES.include?(surface_type)
          holes_mm.each_with_index do |loop, index|
            result << "surface hole #{index + 1} requires at least three points" if loop.length < 3
            result << "surface hole #{index + 1} is self-intersecting" if loop.length >= 4 && self_intersecting?(loop)
            result << "surface hole #{index + 1} lies outside outer boundary" unless loop.empty? || point_in_polygon?(loop.first, outer_boundary_mm)
          end
          result << 'surface holes consume all field area' if net_area_mm2 <= 1.0 && outer_boundary_mm.length >= 3
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def outer_area_mm2
          polygon_area_mm2(outer_boundary_mm)
        end

        def holes_area_mm2
          holes_mm.sum { |loop| polygon_area_mm2(loop) }
        end

        def net_area_mm2
          [outer_area_mm2 - holes_area_mm2, 0.0].max
        end

        def perimeter_mm
          loop_perimeter_mm(outer_boundary_mm)
        end

        def hole_perimeter_mm
          holes_mm.sum { |loop| loop_perimeter_mm(loop) }
        end

        def all_perimeter_mm
          perimeter_mm + hole_perimeter_mm
        end

        def bounding_box_mm
          points = outer_boundary_mm
          return { min: [0.0, 0.0, base_elevation_mm], max: [0.0, 0.0, base_elevation_mm] }.freeze if points.empty?

          xs = points.map { |point| point[0] }
          ys = points.map { |point| point[1] }
          zs = points.map { |point| point[2] }
          { min: [xs.min, ys.min, zs.min], max: [xs.max, ys.max, zs.max] }.freeze
        end

        def center_mm
          box = bounding_box_mm
          [
            (box[:min][0] + box[:max][0]) / 2.0,
            (box[:min][1] + box[:max][1]) / 2.0,
            base_elevation_mm
          ].freeze
        end

        def with(outer_boundary_mm: self.outer_boundary_mm, holes_mm: self.holes_mm,
                 surface_type: self.surface_type, base_level_id: self.base_level_id,
                 base_elevation_mm: self.base_elevation_mm, assembly_id: self.assembly_id,
                 drain_target_id: self.drain_target_id, slope_definition: self.slope_definition)
          self.class.new(
            outer_boundary_mm: outer_boundary_mm,
            holes_mm: holes_mm,
            surface_type: surface_type,
            base_level_id: base_level_id,
            base_elevation_mm: base_elevation_mm,
            assembly_id: assembly_id,
            drain_target_id: drain_target_id,
            slope_definition: slope_definition
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'outer_boundary_mm' => outer_boundary_mm,
            'holes_mm' => holes_mm,
            'surface_type' => surface_type,
            'base_level_id' => base_level_id,
            'base_elevation_mm' => base_elevation_mm,
            'assembly_id' => assembly_id,
            'drain_target_id' => drain_target_id,
            'slope_definition' => slope_definition&.to_h
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            outer_boundary_mm: data['outer_boundary_mm'] || data[:outer_boundary_mm] || [],
            holes_mm: data['holes_mm'] || data[:holes_mm] || [],
            surface_type: data['surface_type'] || data[:surface_type] || 'generic',
            base_level_id: data['base_level_id'] || data[:base_level_id],
            base_elevation_mm: data['base_elevation_mm'] || data[:base_elevation_mm] || 0,
            assembly_id: data['assembly_id'] || data[:assembly_id],
            drain_target_id: data['drain_target_id'] || data[:drain_target_id],
            slope_definition: data['slope_definition'] || data[:slope_definition]
          )
        end

        private

        def normalize_loop(values)
          Array(values).map do |point|
            item = Array(point)
            raise ArgumentError, 'surface point requires x, y, z' unless item.length >= 3

            [Float(item[0]), Float(item[1]), Float(item[2])].freeze
          end
        end

        def polygon_area_mm2(loop)
          return 0.0 if loop.length < 3
          loop.each_with_index.sum do |point, index|
            nxt = loop[(index + 1) % loop.length]
            (point[0] * nxt[1]) - (nxt[0] * point[1])
          end.abs / 2.0
        end

        def loop_perimeter_mm(loop)
          return 0.0 if loop.length < 2
          loop.each_with_index.sum do |point, index|
            nxt = loop[(index + 1) % loop.length]
            dx = nxt[0] - point[0]
            dy = nxt[1] - point[1]
            dz = nxt[2] - point[2]
            Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
          end
        end

        def self_intersecting?(loop)
          edges = loop.each_with_index.map { |point, index| [point, loop[(index + 1) % loop.length], index] }
          edges.combination(2).any? do |(a1, a2, ai), (b1, b2, bi)|
            next false if ai == bi
            next false if ((ai + 1) % loop.length) == bi || ((bi + 1) % loop.length) == ai

            segments_intersect_2d?(a1, a2, b1, b2)
          end
        end

        def segments_intersect_2d?(a, b, c, d)
          o1 = orientation(a, b, c)
          o2 = orientation(a, b, d)
          o3 = orientation(c, d, a)
          o4 = orientation(c, d, b)
          (o1 * o2).negative? && (o3 * o4).negative?
        end

        def orientation(a, b, c)
          ((b[0] - a[0]) * (c[1] - a[1])) - ((b[1] - a[1]) * (c[0] - a[0]))
        end

        def point_in_polygon?(point, loop)
          return false if loop.length < 3
          x = point[0]
          y = point[1]
          inside = false
          j = loop.length - 1
          loop.each_with_index do |pi, i|
            pj = loop[j]
            intersects = ((pi[1] > y) != (pj[1] > y)) &&
                         (x < ((pj[0] - pi[0]) * (y - pi[1]) / ((pj[1] - pi[1]).nonzero? || 1e-12)) + pi[0])
            inside = !inside if intersects
            j = i
          end
          inside
        end
      end
    end
  end
end
