# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class PipeRouteDefinition
        SCHEMA_VERSION = 1
        SYSTEMS = %w[waste soil rainwater].freeze
        DEFAULT_DIAMETER_MM = 100.0

        attr_reader :system, :diameter_mm, :route_nodes_mm, :start_connector_id,
                    :end_connector_id, :start_invert_mm, :end_invert_mm,
                    :material, :route_strategy, :connection_id

        def initialize(system:, route_nodes_mm:, start_connector_id:, end_connector_id:,
                       diameter_mm: DEFAULT_DIAMETER_MM, start_invert_mm: nil,
                       end_invert_mm: nil, material: 'pvc', route_strategy: 'manual',
                       connection_id: nil)
          @system = system.to_s
          @diameter_mm = Float(diameter_mm)
          @route_nodes_mm = normalize_nodes(route_nodes_mm).freeze
          @start_connector_id = start_connector_id.to_s
          @end_connector_id = end_connector_id.to_s
          @start_invert_mm = optional_float(start_invert_mm)
          @end_invert_mm = optional_float(end_invert_mm)
          @material = material.to_s
          @route_strategy = route_strategy.to_s
          @connection_id = connection_id&.to_s
          freeze
        end

        def errors
          result = []
          result << 'unsupported drainage system' unless SYSTEMS.include?(system)
          result << 'pipe diameter must be greater than zero' unless diameter_mm.positive?
          result << 'pipe route requires at least two nodes' if route_nodes_mm.length < 2
          result << 'pipe route contains zero-length segment' if segment_lengths_mm.any? { |length| length <= 0.001 }
          result << 'start connector required' if start_connector_id.strip.empty?
          result << 'end connector required' if end_connector_id.strip.empty?
          result << 'start/end connector must differ' if start_connector_id == end_connector_id && !start_connector_id.empty?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def length_mm
          segment_lengths_mm.sum
        end

        def horizontal_length_mm
          route_nodes_mm.each_cons(2).sum do |a, b|
            dx = b[0] - a[0]
            dy = b[1] - a[1]
            Math.sqrt((dx * dx) + (dy * dy))
          end
        end

        def slope_ratio
          return nil if start_invert_mm.nil? || end_invert_mm.nil?
          return nil if horizontal_length_mm <= 0.001

          (start_invert_mm - end_invert_mm) / horizontal_length_mm
        end

        def slope_percent
          value = slope_ratio
          value.nil? ? nil : value * 100.0
        end

        def invert_known?
          !start_invert_mm.nil? && !end_invert_mm.nil?
        end

        def with(system: self.system, diameter_mm: self.diameter_mm,
                 route_nodes_mm: self.route_nodes_mm,
                 start_connector_id: self.start_connector_id,
                 end_connector_id: self.end_connector_id,
                 start_invert_mm: self.start_invert_mm, end_invert_mm: self.end_invert_mm,
                 material: self.material, route_strategy: self.route_strategy,
                 connection_id: self.connection_id)
          self.class.new(
            system: system,
            diameter_mm: diameter_mm,
            route_nodes_mm: route_nodes_mm,
            start_connector_id: start_connector_id,
            end_connector_id: end_connector_id,
            start_invert_mm: start_invert_mm,
            end_invert_mm: end_invert_mm,
            material: material,
            route_strategy: route_strategy,
            connection_id: connection_id
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'system' => system,
            'diameter_mm' => diameter_mm,
            'route_nodes_mm' => route_nodes_mm,
            'start_connector_id' => start_connector_id,
            'end_connector_id' => end_connector_id,
            'start_invert_mm' => start_invert_mm,
            'end_invert_mm' => end_invert_mm,
            'material' => material,
            'route_strategy' => route_strategy,
            'connection_id' => connection_id
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            system: data['system'] || data[:system] || 'waste',
            diameter_mm: data['diameter_mm'] || data[:diameter_mm] || DEFAULT_DIAMETER_MM,
            route_nodes_mm: data['route_nodes_mm'] || data[:route_nodes_mm] || [],
            start_connector_id: data['start_connector_id'] || data[:start_connector_id],
            end_connector_id: data['end_connector_id'] || data[:end_connector_id],
            start_invert_mm: data['start_invert_mm'] || data[:start_invert_mm],
            end_invert_mm: data['end_invert_mm'] || data[:end_invert_mm],
            material: data['material'] || data[:material] || 'pvc',
            route_strategy: data['route_strategy'] || data[:route_strategy] || 'manual',
            connection_id: data['connection_id'] || data[:connection_id]
          )
        end

        private

        def normalize_nodes(values)
          Array(values).map do |point|
            item = Array(point)
            raise ArgumentError, 'pipe route node requires x, y, z' unless item.length >= 3

            [Float(item[0]), Float(item[1]), Float(item[2])].freeze
          end
        end

        def segment_lengths_mm
          route_nodes_mm.each_cons(2).map do |a, b|
            dx = b[0] - a[0]
            dy = b[1] - a[1]
            dz = b[2] - a[2]
            Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
          end.freeze
        end

        def optional_float(value)
          value.nil? || value == '' ? nil : Float(value)
        end
      end
    end
  end
end
