# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class ConnectorRegistry
        CONNECTORS_KEY = 'connectors'
        CONNECTIONS_KEY = 'connections'
        VALID_STATES = %w[available connected disabled].freeze

        def initialize(id_generator: IdGenerator.new, diagnostics: nil)
          @id_generator = id_generator
          @diagnostics = diagnostics
          @compatibility = {}
          @model = nil
        end

        def attach_model(model)
          @model = model
          self
        end

        def register_compatibility(type_a, type_b, system: nil, bidirectional: true)
          a = type_a.to_s
          b = type_b.to_s
          raise ArgumentError, 'connector type required' if a.empty? || b.empty?

          @compatibility[[a, b]] = system&.to_s
          @compatibility[[b, a]] = system&.to_s if bidirectional
          true
        end

        def compatible?(from_type, to_type, system: nil)
          key = [from_type.to_s, to_type.to_s]
          return false unless @compatibility.key?(key)

          required_system = @compatibility[key]
          required_system.nil? || system.nil? || required_system == system.to_s
        end

        def register_connector(owner_object_id:, type:, role:, nominal_size_mm: nil,
                               position_mm: nil, direction: nil, properties: {}, state: 'available',
                               connector_id: nil)
          ensure_model!
          id = connector_id.to_s.strip
          id = @id_generator.connector_id if id.empty?
          raise ArgumentError, "connector already exists: #{id}" if connectors.key?(id)
          raise ArgumentError, 'owner object id required' if owner_object_id.to_s.strip.empty?
          raise ArgumentError, 'connector type required' if type.to_s.strip.empty?
          raise ArgumentError, 'connector role required' if role.to_s.strip.empty?
          validate_state!(state)

          record = {
            'id' => id,
            'owner_object_id' => owner_object_id.to_s,
            'type' => type.to_s,
            'role' => role.to_s,
            'nominal_size_mm' => nominal_size_mm.nil? ? nil : Float(nominal_size_mm),
            'position_mm' => normalize_point(position_mm),
            'direction' => normalize_vector(direction),
            'properties' => normalize_hash(properties),
            'state' => state.to_s
          }
          values = connectors
          values[id] = record
          write_connectors(values)
          deep_freeze(record.dup)
        end

        def connector(connector_id)
          value = connectors.fetch(connector_id.to_s)
          deep_freeze(value.dup)
        end

        def connectors_for(owner_object_id)
          connectors.values.select { |item| item['owner_object_id'] == owner_object_id.to_s }
                    .map { |item| deep_freeze(item.dup) }.freeze
        end

        def all_connectors
          connectors.values.map { |item| deep_freeze(item.dup) }.freeze
        end

        def update_connector(connector_id, position_mm: :__unchanged__, direction: :__unchanged__,
                             properties: :__unchanged__, state: :__unchanged__, nominal_size_mm: :__unchanged__)
          values = connectors
          current = values.fetch(connector_id.to_s).dup
          current['position_mm'] = normalize_point(position_mm) unless position_mm == :__unchanged__
          current['direction'] = normalize_vector(direction) unless direction == :__unchanged__
          current['properties'] = normalize_hash(properties) unless properties == :__unchanged__
          unless state == :__unchanged__
            validate_state!(state)
            current['state'] = state.to_s
          end
          current['nominal_size_mm'] = nominal_size_mm.nil? ? nil : Float(nominal_size_mm) unless nominal_size_mm == :__unchanged__
          values[current['id']] = current
          write_connectors(values)
          deep_freeze(current.dup)
        end

        def register_connection(from_connector_id:, to_connector_id:, system:, metadata: {}, connection_id: nil)
          ensure_model!
          from = connector(from_connector_id)
          to = connector(to_connector_id)
          semantic_errors = MepSemanticContract.validate_connection(
            from_connector: from, to_connector: to, system: system, metadata: metadata
          )
          raise ArgumentError, semantic_errors.join('; ') unless semantic_errors.empty?
          unless compatible?(from['type'], to['type'], system: system)
            raise ArgumentError, "incompatible connectors: #{from['type']} → #{to['type']} for #{system}"
          end
          raise ArgumentError, 'disabled connector cannot be connected' if from['state'] == 'disabled' || to['state'] == 'disabled'

          id = connection_id.to_s.strip
          id = @id_generator.connection_id if id.empty?
          raise ArgumentError, "connection already exists: #{id}" if connections.key?(id)
          if connections.values.any? { |value| same_pair?(value, from['id'], to['id']) && value['system'] == system.to_s }
            raise ArgumentError, 'connection already exists between connectors'
          end

          record = {
            'id' => id,
            'from_connector_id' => from['id'],
            'to_connector_id' => to['id'],
            'system' => system.to_s,
            'state' => 'active',
            'metadata' => MepSemanticContract.normalize_metadata(metadata)
          }
          values = connections
          values[id] = record
          write_connections(values)
          recalculate_connector_state(from['id'])
          recalculate_connector_state(to['id'])
          deep_freeze(record.dup)
        end

        def connection(connection_id)
          value = connections.fetch(connection_id.to_s)
          deep_freeze(value.dup)
        end

        def connections_for_connector(connector_id)
          id = connector_id.to_s
          connections.values.select do |item|
            item['from_connector_id'] == id || item['to_connector_id'] == id
          end.map { |item| deep_freeze(item.dup) }.freeze
        end

        def connections_for_object(owner_object_id)
          ids = connectors_for(owner_object_id).map { |item| item['id'] }
          connections.values.select do |item|
            ids.include?(item['from_connector_id']) || ids.include?(item['to_connector_id'])
          end.map { |item| deep_freeze(item.dup) }.freeze
        end

        def replace_endpoint(connection_id, old_connector_id:, new_connector_id:)
          values = connections
          current = values.fetch(connection_id.to_s).dup
          old_id = old_connector_id.to_s
          new_connector = connector(new_connector_id)
          side = if current['from_connector_id'] == old_id
                   'from_connector_id'
                 elsif current['to_connector_id'] == old_id
                   'to_connector_id'
                 end
          raise ArgumentError, "connector #{old_id} is not part of connection #{connection_id}" unless side

          other_id = side == 'from_connector_id' ? current['to_connector_id'] : current['from_connector_id']
          other = connector(other_id)
          from = side == 'from_connector_id' ? new_connector : other
          to = side == 'to_connector_id' ? new_connector : other
          unless compatible?(from['type'], to['type'], system: current['system'])
            raise ArgumentError, "replacement connector is incompatible with #{current['system']}"
          end

          current[side] = new_connector['id']
          values[current['id']] = current
          write_connections(values)
          recalculate_connector_state(old_id)
          recalculate_connector_state(new_connector['id'])
          deep_freeze(current.dup)
        end

        def disconnect(connection_id)
          values = connections
          removed = values.delete(connection_id.to_s)
          return nil unless removed

          write_connections(values)
          recalculate_connector_state(removed['from_connector_id'])
          recalculate_connector_state(removed['to_connector_id'])
          deep_freeze(removed.dup)
        end

        def connection_for_route(route_object_id)
          value = connections.values.find do |item|
            item.fetch('metadata', {})['route_object_id'].to_s == route_object_id.to_s
          end
          value ? deep_freeze(value.dup) : nil
        end

        def disable_connectors_for(owner_object_id)
          connectors_for(owner_object_id).map do |item|
            update_connector(item['id'], state: 'disabled')
          end.freeze
        end

        def connector_count
          connectors.size
        end

        def connection_count
          connections.size
        end

        private

        def ensure_model!
          raise 'ConnectorRegistry is not attached to a model' unless @model
        end

        def connectors
          ensure_model!
          raw = AttributeStore.new(@model).read_json(CONNECTORS_KEY, {}, dictionary: AttributeStore::CORE_DICTIONARY) || {}
          normalize_records(raw)
        end

        def connections
          ensure_model!
          raw = AttributeStore.new(@model).read_json(CONNECTIONS_KEY, {}, dictionary: AttributeStore::CORE_DICTIONARY) || {}
          normalize_records(raw)
        end

        def write_connectors(values)
          AttributeStore.new(@model).write_json(CONNECTORS_KEY, values, dictionary: AttributeStore::CORE_DICTIONARY)
        end

        def write_connections(values)
          AttributeStore.new(@model).write_json(CONNECTIONS_KEY, values, dictionary: AttributeStore::CORE_DICTIONARY)
        end

        def normalize_records(raw)
          raw.each_with_object({}) do |(key, value), result|
            result[key.to_s] = normalize_hash(value)
          end
        end

        def normalize_hash(value)
          (value || {}).each_with_object({}) do |(key, item), result|
            result[key.to_s] = item
          end
        end

        def normalize_point(value)
          return nil if value.nil?

          values = Array(value)
          raise ArgumentError, 'position requires x, y, z' unless values.length >= 3

          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

        def normalize_vector(value)
          return nil if value.nil?

          values = Array(value)
          raise ArgumentError, 'direction requires x, y, z' unless values.length >= 3

          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

        def validate_state!(state)
          raise ArgumentError, "invalid connector state: #{state}" unless VALID_STATES.include?(state.to_s)
        end

        def recalculate_connector_state(connector_id)
          current = connector(connector_id)
          return current if current['state'] == 'disabled'

          next_state = connections_for_connector(connector_id).empty? ? 'available' : 'connected'
          update_connector(connector_id, state: next_state)
        end

        def same_pair?(record, a, b)
          (record['from_connector_id'] == a && record['to_connector_id'] == b) ||
            (record['from_connector_id'] == b && record['to_connector_id'] == a)
        end

        def deep_freeze(value)
          case value
          when Hash
            value.each { |key, item| deep_freeze(key); deep_freeze(item) }
          when Array
            value.each { |item| deep_freeze(item) }
          end
          value.freeze
        end
      end
    end
  end
end
