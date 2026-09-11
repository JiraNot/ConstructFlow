# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      # Semantic gravity rainwater link between a roof/gutter outlet and a
      # downstream Drainage connector. Unlike PipeRouteDefinition this object
      # intentionally does not apply horizontal pipe slope rules, because a
      # valid downpipe can be predominantly or entirely vertical.
      class DownpipeDefinition
        SCHEMA_VERSION = 1
        DEFAULT_DIAMETER_MM = 100.0

        attr_reader :route_nodes_mm, :start_connector_id, :end_connector_id,
                    :diameter_mm, :material, :route_strategy, :connection_id

        def initialize(route_nodes_mm:, start_connector_id:, end_connector_id:,
                       diameter_mm: DEFAULT_DIAMETER_MM, material: 'pvc',
                       route_strategy: 'direct', connection_id: nil)
          @route_nodes_mm = normalize_nodes(route_nodes_mm).freeze
          @start_connector_id = start_connector_id.to_s
          @end_connector_id = end_connector_id.to_s
          @diameter_mm = Float(diameter_mm)
          @material = material.to_s
          @route_strategy = route_strategy.to_s
          @connection_id = connection_id&.to_s
          freeze
        end

        def errors
          result = []
          result << 'downpipe diameter must be greater than zero' unless diameter_mm.positive?
          result << 'downpipe route requires at least two nodes' if route_nodes_mm.length < 2
          result << 'downpipe route contains zero-length segment' if segment_lengths_mm.any? { |length| length <= 0.001 }
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

        def vertical_length_mm
          route_nodes_mm.each_cons(2).sum { |a, b| (b[2] - a[2]).abs }
        end

        def horizontal_length_mm
          route_nodes_mm.each_cons(2).sum do |a, b|
            dx = b[0] - a[0]
            dy = b[1] - a[1]
            Math.sqrt((dx * dx) + (dy * dy))
          end
        end

        def with(route_nodes_mm: self.route_nodes_mm,
                 start_connector_id: self.start_connector_id,
                 end_connector_id: self.end_connector_id,
                 diameter_mm: self.diameter_mm, material: self.material,
                 route_strategy: self.route_strategy, connection_id: self.connection_id)
          self.class.new(
            route_nodes_mm: route_nodes_mm,
            start_connector_id: start_connector_id,
            end_connector_id: end_connector_id,
            diameter_mm: diameter_mm,
            material: material,
            route_strategy: route_strategy,
            connection_id: connection_id
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'route_nodes_mm' => route_nodes_mm,
            'start_connector_id' => start_connector_id,
            'end_connector_id' => end_connector_id,
            'diameter_mm' => diameter_mm,
            'material' => material,
            'route_strategy' => route_strategy,
            'connection_id' => connection_id
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            route_nodes_mm: data['route_nodes_mm'] || data[:route_nodes_mm] || [],
            start_connector_id: data['start_connector_id'] || data[:start_connector_id],
            end_connector_id: data['end_connector_id'] || data[:end_connector_id],
            diameter_mm: data['diameter_mm'] || data[:diameter_mm] || DEFAULT_DIAMETER_MM,
            material: data['material'] || data[:material] || 'pvc',
            route_strategy: data['route_strategy'] || data[:route_strategy] || 'direct',
            connection_id: data['connection_id'] || data[:connection_id]
          )
        end

        private

        def normalize_nodes(values)
          Array(values).map do |point|
            item = Array(point)
            raise ArgumentError, 'downpipe route node requires x, y, z' unless item.length >= 3

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
      end
    end
  end
end
