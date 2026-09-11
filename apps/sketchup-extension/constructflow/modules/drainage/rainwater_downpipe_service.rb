# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      # Drainage-owned mutation boundary for roof rainwater links. Roof supplies
      # an explicit gutter outlet and target connector; Drainage owns topology,
      # semantic route geometry and persistence.
      class RainwaterDownpipeService
        SYSTEM = 'drainage.rainwater'
        POSITION_TOLERANCE_MM = 0.001

        def initialize(runtime:, repository: Repository.new, geometry: Geometry.new)
          @runtime = runtime
          @repository = repository
          @geometry = geometry
        end

        def create(start_connector_id:, end_connector_id:, route_nodes_mm: nil,
                   diameter_mm: DownpipeDefinition::DEFAULT_DIAMETER_MM,
                   material: 'pvc', route_strategy: 'direct', display_name: 'Rainwater Downpipe',
                   source_state: 'confirmed', created_phase: nil, generated_from_id: nil)
          start_connector = connector!(start_connector_id, 'start')
          end_connector = connector!(end_connector_id, 'end')
          validate_connection!(start_connector, end_connector)

          nodes = normalize_or_derive_nodes(route_nodes_mm, start_connector, end_connector)
          definition = DownpipeDefinition.new(
            route_nodes_mm: nodes,
            start_connector_id: start_connector['id'],
            end_connector_id: end_connector['id'],
            diameter_mm: diameter_mm,
            material: material,
            route_strategy: route_strategy
          )
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          group = @geometry.create_pipe_group(@runtime.active_model, definition)
          group.name = 'ConstructFlow Rainwater Downpipe' if group.respond_to?(:name=)
          object = @runtime.smart_objects.create(
            entity: group,
            type: 'drainage.downpipe',
            owner_module: 'constructflow.drainage',
            display_name: display_name,
            created_phase: created_phase || Core::Phase::NEW_CONSTRUCTION,
            source_state: source_state
          )
          connection = @runtime.connectors.register_connection(
            from_connector_id: start_connector['id'],
            to_connector_id: end_connector['id'],
            system: SYSTEM,
            metadata: { route_object_id: object.id, route_kind: 'downpipe' }
          )
          definition = definition.with(connection_id: connection['id'])
          @repository.write_downpipe(group, definition)

          add_endpoint_relationship(group, start_connector, 'rainwater_source')
          add_endpoint_relationship(group, end_connector, 'rainwater_destination')
          add_generated_from_relationship(group, generated_from_id)
          @runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')

          {
            object: object,
            definition: definition,
            connection: connection
          }.freeze
        rescue StandardError
          cleanup_failed_object(group, object) if defined?(group) && group
          raise
        end

        private

        def connector!(connector_id, label)
          id = connector_id.to_s
          raise ArgumentError, "#{label}_connector_id required" if id.empty?
          @runtime.connectors.connector(id)
        rescue KeyError
          raise ArgumentError, "#{label} connector not found: #{id}"
        end

        def validate_connection!(start_connector, end_connector)
          if start_connector['id'] == end_connector['id']
            raise ArgumentError, 'downpipe start/end connector must differ'
          end
          unless @runtime.connectors.compatible?(start_connector['type'], end_connector['type'], system: SYSTEM)
            raise ArgumentError,
                  "incompatible rainwater connectors: #{start_connector['type']} → #{end_connector['type']}"
          end
          unless @runtime.connectors.connections_for_connector(start_connector['id']).empty?
            raise ArgumentError, 'gutter outlet already has an active rainwater connection'
          end
          raise ArgumentError, 'disabled gutter outlet cannot be connected' if start_connector['state'] == 'disabled'
          raise ArgumentError, 'disabled rainwater destination cannot be connected' if end_connector['state'] == 'disabled'
        end

        def normalize_or_derive_nodes(values, start_connector, end_connector)
          start_point = required_position(start_connector, 'gutter outlet')
          end_point = required_position(end_connector, 'rainwater destination')
          supplied = compact_adjacent(Array(values))
          if supplied.empty?
            vertical_drop = [start_point[0], start_point[1], end_point[2]]
            return compact_adjacent([start_point, vertical_drop, end_point])
          end

          raise ArgumentError, 'downpipe route must start at gutter outlet connector position' unless same_point?(supplied.first, start_point)
          raise ArgumentError, 'downpipe route must end at rainwater destination connector position' unless same_point?(supplied.last, end_point)
          supplied
        end

        def required_position(connector, label)
          values = Array(connector['position_mm'])
          raise ArgumentError, "#{label} connector position required" unless values.length >= 3
          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

        def compact_adjacent(nodes)
          nodes.each_with_object([]) do |point, result|
            values = Array(point)
            raise ArgumentError, 'downpipe route node requires x, y, z' unless values.length >= 3
            normalized = [Float(values[0]), Float(values[1]), Float(values[2])]
            result << normalized unless result.last && same_point?(result.last, normalized)
          end
        end

        def same_point?(a, b)
          Array(a).zip(Array(b)).all? { |left, right| (Float(left) - Float(right)).abs <= POSITION_TOLERANCE_MM }
        end

        def add_endpoint_relationship(entity, connector, role)
          owner_id = connector['owner_object_id'].to_s
          return if owner_id.empty?

          @runtime.smart_objects.add_relationship(
            entity,
            kind: 'connects_to',
            target_id: owner_id,
            role: role,
            metadata: { connector_id: connector['id'], system: SYSTEM }
          )
        end

        def add_generated_from_relationship(entity, generated_from_id)
          source_id = generated_from_id.to_s
          return if source_id.empty?
          return unless @runtime.smart_objects.fetch_by_id(source_id)

          @runtime.smart_objects.add_relationship(
            entity,
            kind: 'generated_from',
            target_id: source_id,
            role: 'extension_source'
          )
        end

        def cleanup_failed_object(group, object)
          return unless object && @runtime.smart_objects.respond_to?(:erase!)
          @runtime.smart_objects.erase!(group, allow_existing: false)
        rescue StandardError
          nil
        end
      end
    end
  end
end
