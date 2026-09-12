# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      class FalseCeilingDefinition
        SCHEMA_VERSION = 1
        TYPES = %w[flat_gypsum grid_acoustic cove_soffit stepped].freeze

        attr_reader :id, :boundary_nodes_mm, :ceiling_type, :elevation_z_mm,
                    :plenum_depth_mm, :perimeter_gap_mm, :cove_trough,
                    :grid_size_mm

        def initialize(id: nil, boundary_nodes_mm:, ceiling_type: 'flat_gypsum',
                       elevation_z_mm: 2600.0, plenum_depth_mm: 200.0,
                       perimeter_gap_mm: 15.0, cove_trough: nil,
                       grid_size_mm: [600.0, 600.0])
          @id = id&.to_s
          @boundary_nodes_mm = normalize_nodes(boundary_nodes_mm).freeze
          @ceiling_type = ceiling_type.to_s
          @elevation_z_mm = Float(elevation_z_mm)
          @plenum_depth_mm = Float(plenum_depth_mm)
          @perimeter_gap_mm = Float(perimeter_gap_mm)
          @cove_trough = normalize_cove(cove_trough).freeze
          @grid_size_mm = [Float(grid_size_mm[0] || 600.0), Float(grid_size_mm[1] || 600.0)].freeze
          freeze
        end

        def errors
          result = []
          result << 'ceiling boundary requires at least 3 points' if boundary_nodes_mm.length < 3
          result << 'unsupported ceiling type' unless TYPES.include?(ceiling_type)
          result << 'elevation must be positive' unless elevation_z_mm.positive?
          result << 'plenum depth must be positive' unless plenum_depth_mm.positive?
          result << 'perimeter gap cannot be negative' if perimeter_gap_mm.negative?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def area_sqm
          pts = boundary_nodes_mm
          n = pts.length
          return 0.0 if n < 3

          area2 = 0.0
          pts.each_with_index do |p1, i|
            p2 = pts[(i + 1) % n]
            area2 += (p1[0] * p2[1]) - (p2[0] * p1[1])
          end
          (area2.abs / 2.0) / 1_000_000.0
        end

        def perimeter_length_mm
          pts = boundary_nodes_mm
          n = pts.length
          return 0.0 if n < 2

          pts.each_with_index.sum do |p1, i|
            p2 = pts[(i + 1) % n]
            dx = p2[0] - p1[0]
            dy = p2[1] - p1[1]
            Math.sqrt((dx * dx) + (dy * dy))
          end
        end

        def has_cove?
          ceiling_type == 'cove_soffit' || (!cove_trough.nil? && cove_trough[:width_mm].to_f.positive?)
        end

        def cove_length_mm
          has_cove? ? perimeter_length_mm : 0.0
        end

        def with(**changes)
          self.class.new(
            id: changes.fetch(:id, id),
            boundary_nodes_mm: changes.fetch(:boundary_nodes_mm, boundary_nodes_mm),
            ceiling_type: changes.fetch(:ceiling_type, ceiling_type),
            elevation_z_mm: changes.fetch(:elevation_z_mm, elevation_z_mm),
            plenum_depth_mm: changes.fetch(:plenum_depth_mm, plenum_depth_mm),
            perimeter_gap_mm: changes.fetch(:perimeter_gap_mm, perimeter_gap_mm),
            cove_trough: changes.fetch(:cove_trough, cove_trough),
            grid_size_mm: changes.fetch(:grid_size_mm, grid_size_mm)
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'id' => id,
            'boundary_nodes_mm' => boundary_nodes_mm,
            'ceiling_type' => ceiling_type,
            'elevation_z_mm' => elevation_z_mm,
            'plenum_depth_mm' => plenum_depth_mm,
            'perimeter_gap_mm' => perimeter_gap_mm,
            'cove_trough' => cove_trough,
            'grid_size_mm' => grid_size_mm,
            'area_sqm' => area_sqm.round(3),
            'perimeter_length_mm' => perimeter_length_mm.round(1),
            'cove_length_mm' => cove_length_mm.round(1)
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            id: data['id'] || data[:id],
            boundary_nodes_mm: data['boundary_nodes_mm'] || data[:boundary_nodes_mm] || [],
            ceiling_type: data['ceiling_type'] || data[:ceiling_type] || 'flat_gypsum',
            elevation_z_mm: data['elevation_z_mm'] || data[:elevation_z_mm] || 2600.0,
            plenum_depth_mm: data['plenum_depth_mm'] || data[:plenum_depth_mm] || 200.0,
            perimeter_gap_mm: data['perimeter_gap_mm'] || data[:perimeter_gap_mm] || 15.0,
            cove_trough: data['cove_trough'] || data[:cove_trough],
            grid_size_mm: data['grid_size_mm'] || data[:grid_size_mm] || [600.0, 600.0]
          )
        end

        private

        def normalize_nodes(nodes)
          Array(nodes).map do |p|
            arr = Array(p)
            [Float(arr[0] || 0.0), Float(arr[1] || 0.0), Float(arr[2] || 0.0)].freeze
          end
        end

        def normalize_cove(hash)
          return nil unless hash

          h = hash.transform_keys(&:to_sym)
          {
            width_mm: Float(h[:width_mm] || 150.0),
            upstand_mm: Float(h[:upstand_mm] || 80.0),
            light_strip: h[:light_strip] == true
          }
        end
      end
    end
  end
end
