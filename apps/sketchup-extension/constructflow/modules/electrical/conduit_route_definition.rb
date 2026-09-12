# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      class ConduitRouteDefinition
        SCHEMA_VERSION = 1
        SYSTEMS = %w[power lighting data fire_alarm control].freeze
        CONDUIT_TYPES = %w[emt imc rmc pvc flex].freeze
        STANDARD_SIZES_MM = [15.0, 20.0, 25.0, 32.0, 40.0, 50.0, 65.0, 80.0, 90.0, 100.0].freeze
        MAX_CUMULATIVE_BEND_DEG = 360.0
        MAX_RUN_WITHOUT_PULLBOX_MM = 30_000.0
        EPSILON = 1.0e-6

        attr_reader :id, :system, :conduit_type, :nominal_size_mm,
                    :route_nodes_mm, :start_object_id, :end_object_id,
                    :cable_ids

        def initialize(id: nil, system: 'power', conduit_type: 'emt',
                       nominal_size_mm: 20.0, route_nodes_mm: [],
                       start_object_id: nil, end_object_id: nil,
                       cable_ids: [])
          @id = id&.to_s
          @system = system.to_s
          @conduit_type = conduit_type.to_s
          @nominal_size_mm = Float(nominal_size_mm)
          @route_nodes_mm = normalize_nodes(route_nodes_mm).freeze
          @start_object_id = start_object_id&.to_s
          @end_object_id = end_object_id&.to_s
          @cable_ids = Array(cable_ids).map(&:to_s).reject(&:empty?).uniq.freeze
          freeze
        end

        def errors
          result = []
          result << 'unsupported electrical system' unless SYSTEMS.include?(system)
          result << 'unsupported conduit type' unless CONDUIT_TYPES.include?(conduit_type)
          result << 'nominal size must be positive' unless nominal_size_mm.positive?
          result << 'conduit route requires at least two nodes' if route_nodes_mm.length < 2
          result << 'conduit route contains zero-length segment' if segment_lengths_mm.any? { |l| l <= 0.001 }
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def length_mm
          segment_lengths_mm.sum
        end

        def segment_lengths_mm
          route_nodes_mm.each_cons(2).map do |a, b|
            dx = b[0] - a[0]
            dy = b[1] - a[1]
            dz = b[2] - a[2]
            Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
          end.freeze
        end

        def min_bend_radius_mm
          # National Electrical Code (NEC) Table 2 / BS 7671:
          # Minimum radius of conduit bend is generally 6 times conduit trade size / OD
          nominal_size_mm * 6.0
        end

        def bend_angles_deg
          return [].freeze if route_nodes_mm.length < 3

          angles = []
          route_nodes_mm.each_cons(3) do |a, b, c|
            v1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
            v2 = [c[0] - b[0], c[1] - b[1], c[2] - b[2]]
            len1 = Math.sqrt((v1[0]**2) + (v1[1]**2) + (v1[2]**2))
            len2 = Math.sqrt((v2[0]**2) + (v2[1]**2) + (v2[2]**2))
            if len1 <= EPSILON || len2 <= EPSILON
              angles << 0.0
              next
            end

            dot = (v1[0] * v2[0]) + (v1[1] * v2[1]) + (v1[2] * v2[2])
            cos_theta = (dot / (len1 * len2)).clamp(-1.0, 1.0)
            # Deviation angle in degrees: 0 means straight forward, 90 is a right angle bend
            angle_rad = Math.acos(cos_theta)
            angles << (angle_rad * 180.0 / Math::PI)
          end
          angles.freeze
        end

        def cumulative_bend_deg
          bend_angles_deg.sum
        end

        def max_bends_exceeded?
          cumulative_bend_deg > MAX_CUMULATIVE_BEND_DEG
        end

        def pull_box_required?
          max_bends_exceeded? || length_mm > MAX_RUN_WITHOUT_PULLBOX_MM
        end

        def pull_box_recommended_indices
          return [].freeze unless pull_box_required?

          indices = []
          running_bends = 0.0
          running_length = 0.0

          angles = bend_angles_deg
          lengths = segment_lengths_mm

          route_nodes_mm.each_with_index do |_, idx|
            next if idx.zero? || idx == route_nodes_mm.length - 1

            seg_len = lengths[idx - 1] || 0.0
            running_length += seg_len

            bend_angle = angles[idx - 1] || 0.0
            running_bends += bend_angle

            if running_bends >= MAX_CUMULATIVE_BEND_DEG || running_length >= MAX_RUN_WITHOUT_PULLBOX_MM
              indices << idx
              running_bends = 0.0
              running_length = 0.0
            end
          end
          indices.freeze
        end

        def with(**changes)
          self.class.new(**to_h.transform_keys(&:to_sym).merge(changes).reject { |k, _| k == :schema_version })
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'id' => id,
            'system' => system,
            'conduit_type' => conduit_type,
            'nominal_size_mm' => nominal_size_mm,
            'route_nodes_mm' => route_nodes_mm,
            'start_object_id' => start_object_id,
            'end_object_id' => end_object_id,
            'cable_ids' => cable_ids
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            id: data['id'] || data[:id],
            system: data['system'] || data[:system] || 'power',
            conduit_type: data['conduit_type'] || data[:conduit_type] || 'emt',
            nominal_size_mm: data['nominal_size_mm'] || data[:nominal_size_mm] || 20.0,
            route_nodes_mm: data['route_nodes_mm'] || data[:route_nodes_mm] || [],
            start_object_id: data['start_object_id'] || data[:start_object_id],
            end_object_id: data['end_object_id'] || data[:end_object_id],
            cable_ids: data['cable_ids'] || data[:cable_ids] || []
          )
        end

        private

        def normalize_nodes(values)
          Array(values).map do |point|
            item = Array(point)
            raise ArgumentError, 'conduit route node requires x, y, z' unless item.length >= 3

            [Float(item[0]), Float(item[1]), Float(item[2])].freeze
          end
        end
      end
    end
  end
end
