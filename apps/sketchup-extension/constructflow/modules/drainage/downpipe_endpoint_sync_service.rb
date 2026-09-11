# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      # Rebuilds Drainage-owned downpipes after a semantic endpoint connector
      # moves. Roof only moves the shared Core connector; Drainage owns route
      # regeneration and persistence.
      class DownpipeEndpointSyncService
        SYSTEM = RainwaterDownpipeService::SYSTEM

        def initialize(runtime:, repository: Repository.new, geometry: Geometry.new)
          @runtime = runtime
          @repository = repository
          @geometry = geometry
        end

        def sync_connector(connector_id:)
          connector = @runtime.connectors.connector(connector_id.to_s)
          updated = []
          invalid = []
          downpipe_connections(connector['id']).each do |connection|
            object_id = connection.fetch('metadata', {})['route_object_id'].to_s
            object = @runtime.smart_objects.fetch_by_id(object_id)
            next unless object && object.owner_module == 'constructflow.drainage' && object.type == 'drainage.downpipe'

            definition = @repository.read_downpipe(object.entity)
            unless definition
              invalid << issue(object.id, 'downpipe definition missing')
              dirty_invalid(object)
              next
            end

            begin
              next_definition = synchronize_definition(definition)
              @geometry.rebuild_pipe!(object.entity, next_definition)
              @repository.write_downpipe(object.entity, next_definition)
              @runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
              updated << object.id
            rescue StandardError => error
              invalid << issue(object.id, error.message)
              dirty_invalid(object)
            end
          end

          {
            'connector_id' => connector['id'],
            'updated_downpipe_ids' => updated.uniq.sort.freeze,
            'invalid_downpipes' => invalid.freeze
          }.freeze
        rescue KeyError
          raise ArgumentError, "rainwater connector not found: #{connector_id}"
        end

        private

        def downpipe_connections(connector_id)
          @runtime.connectors.connections_for_connector(connector_id).select do |connection|
            connection['system'].to_s == SYSTEM &&
              connection.fetch('metadata', {})['route_kind'].to_s == 'downpipe'
          end
        end

        def synchronize_definition(definition)
          start_point = connector_position(definition.start_connector_id, 'downpipe start')
          end_point = connector_position(definition.end_connector_id, 'downpipe end')
          nodes = if definition.route_strategy.to_s == 'direct'
                    direct_nodes(start_point, end_point)
                  else
                    explicit_nodes(definition.route_nodes_mm, start_point, end_point)
                  end
          updated = definition.with(route_nodes_mm: nodes)
          raise ArgumentError, updated.errors.join('; ') unless updated.valid?
          updated
        end

        def connector_position(connector_id, label)
          connector = @runtime.connectors.connector(connector_id)
          values = Array(connector['position_mm'])
          raise ArgumentError, "#{label} connector position required" unless values.length >= 3
          [Float(values[0]), Float(values[1]), Float(values[2])]
        rescue KeyError
          raise ArgumentError, "#{label} connector missing: #{connector_id}"
        end

        def direct_nodes(start_point, end_point)
          vertical_drop = [start_point[0], start_point[1], end_point[2]]
          compact_adjacent([start_point, vertical_drop, end_point])
        end

        def explicit_nodes(existing, start_point, end_point)
          nodes = Array(existing).map { |point| Array(point).first(3).map { |value| Float(value) } }
          raise ArgumentError, 'downpipe route requires at least two nodes' if nodes.length < 2
          nodes[0] = start_point
          nodes[-1] = end_point
          compact_adjacent(nodes)
        end

        def compact_adjacent(nodes)
          nodes.each_with_object([]) do |point, result|
            normalized = Array(point).first(3).map { |value| Float(value) }
            result << normalized unless result.last == normalized
          end
        end

        def dirty_invalid(object)
          @runtime.smart_objects.mark_dirty(
            object.entity,
            'dirty_geometry', 'dirty_quantity', 'dirty_drawing'
          )
        end

        def issue(object_id, message)
          { 'downpipe_id' => object_id.to_s, 'message' => message.to_s }.freeze
        end
      end
    end
  end
end
