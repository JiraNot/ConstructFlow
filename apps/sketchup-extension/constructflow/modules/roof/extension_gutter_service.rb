# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      class ExtensionGutterService
        RELATION_KIND = 'generated_from'
        RELATION_ROLE = 'extension_source'
        SLOT = 'primary_gutter'
        AUTO_VALUES = [true, 'auto'].freeze

        def initialize(repository:, geometry:, validator:, edge_capability:)
          @repository = repository
          @geometry = geometry
          @validator = validator
          @edge_capability = edge_capability
        end

        def sync(runtime:, extension_id:, roof_object:, roof_definition:, config:)
          request = fetch(config, :gutter)
          existing = find_generated(runtime, extension_id)

          if explicit_disabled?(request)
            return no_op('extension gutter is disabled') unless existing
            raise ArgumentError, 'generated extension gutter removal is not supported while connector lifecycle/reconnection is unresolved; keep the gutter or use an explicit roof/network change workflow'
          end

          return no_op('extension gutter not requested') if request.nil? && existing.nil?

          current = existing && @repository.read_gutter(existing.entity)
          definition, warnings = definition_for(
            request: request,
            current: current,
            roof_object: roof_object,
            roof_definition: roof_definition
          )
          return no_op(warnings.first || 'extension gutter edge is unresolved') unless definition

          issues = @validator.validate_gutter(definition, roof_definition: roof_definition)
          errors = issues.select { |issue| (issue[:severity] || issue['severity']).to_s == 'error' }
          raise ArgumentError, errors.map { |issue| issue[:message] || issue['message'] }.join('; ') unless errors.empty?
          warnings.concat(
            issues.reject { |issue| (issue[:severity] || issue['severity']).to_s == 'error' }
                  .map { |issue| (issue[:message] || issue['message']).to_s }
          )

          if existing
            return update_existing(
              runtime: runtime,
              object: existing,
              definition: definition,
              roof_object: roof_object,
              extension_id: extension_id,
              warnings: warnings
            )
          end

          create_new(
            runtime: runtime,
            definition: definition,
            roof_object: roof_object,
            extension_id: extension_id,
            request: request,
            warnings: warnings
          )
        end

        private

        def definition_for(request:, current:, roof_object:, roof_definition:)
          options = request.is_a?(Hash) ? stringify_keys(request) : {}
          if request.nil? && current
            return [
              current.with(roof_object_id: roof_object.id),
              []
            ]
          end

          edge_index = if options.key?('edge_index')
                         Integer(options['edge_index'])
                       else
                         auto_low_edge_index(roof_definition)
                       end
          unless edge_index
            return [nil, ['automatic gutter edge is ambiguous for this roof; provide roof.gutter.edge_index explicitly']]
          end

          profile_id = options['profile_id'] || current&.profile_id || 'generic.gutter'
          outlet_ratio = options.key?('outlet_ratio') ? options['outlet_ratio'] : (current&.outlet_ratio || 1.0)
          connector_id = current&.outlet_connector_id
          [
            GutterDefinition.new(
              roof_object_id: roof_object.id,
              edge_index: edge_index,
              profile_id: profile_id,
              outlet_ratio: outlet_ratio,
              outlet_connector_id: connector_id
            ),
            []
          ]
        end

        def auto_low_edge_index(roof_definition)
          edges = roof_definition.sloped_points_mm.each_with_index.map do |point, index|
            finish = roof_definition.sloped_points_mm[(index + 1) % roof_definition.sloped_points_mm.length]
            [index, (Float(point[2]) + Float(finish[2])) / 2.0]
          end
          return nil if edges.empty?

          minimum = edges.map(&:last).min
          candidates = edges.select { |_index, elevation| (elevation - minimum).abs <= 0.001 }
          candidates.length == 1 ? candidates.first.first : nil
        end

        def create_new(runtime:, definition:, roof_object:, extension_id:, request:, warnings:)
          group = @geometry.create_gutter_group(
            runtime.active_model,
            roof_object: roof_object,
            definition: definition,
            edge_capability: @edge_capability
          )
          source_state = explicit_profile?(request) ? 'confirmed' : 'assumed'
          object = runtime.smart_objects.create(
            entity: group,
            type: 'roof.gutter',
            owner_module: 'constructflow.roof',
            display_name: 'Extension Gutter',
            created_phase: Core::Phase::NEW_CONSTRUCTION,
            source_state: source_state
          )
          connector = register_outlet(runtime, object, definition, roof_object)
          stored = definition.with(outlet_connector_id: connector['id'])
          @repository.write_gutter(group, stored)
          runtime.smart_objects.add_relationship(
            group,
            kind: 'host',
            target_id: roof_object.id,
            role: 'roof_edge',
            metadata: { 'capability' => 'roof.edge_host', 'edge_index' => stored.edge_index }
          )
          runtime.smart_objects.add_relationship(
            group,
            kind: RELATION_KIND,
            target_id: extension_id,
            role: RELATION_ROLE,
            metadata: { 'slot' => SLOT, 'domain' => 'roof' }
          )
          runtime.smart_objects.mark_dirty(group, 'dirty_quantity', 'dirty_drawing')
          runtime.smart_objects.mark_dirty(roof_object.entity, 'dirty_quantity', 'dirty_drawing')
          warnings << 'generated extension gutter uses a generic/assumed profile; confirm a company gutter profile before final issue' if source_state == 'assumed'
          {
            created_object_ids: [object.id],
            updated_object_ids: [roof_object.id],
            removed_object_ids: [],
            warnings: warnings.uniq,
            events: [
              { name: 'ObjectCreated', object_ids: [object.id], payload: { type: 'roof.gutter', source: extension_id, slot: SLOT } },
              { name: 'GutterAdded', object_ids: [object.id, roof_object.id], payload: { connector_id: connector['id'], source: extension_id } },
              { name: 'GeometryChanged', object_ids: [object.id] },
              { name: 'QuantityDirty', object_ids: [object.id, roof_object.id] },
              { name: 'DrawingDirty', object_ids: [object.id, roof_object.id] }
            ]
          }
        end

        def update_existing(runtime:, object:, definition:, roof_object:, extension_id:, warnings:)
          @geometry.rebuild_gutter!(
            object.entity,
            roof_object: roof_object,
            definition: definition,
            edge_capability: @edge_capability
          )
          connector = sync_outlet(runtime, object, definition, roof_object)
          stored = definition.with(outlet_connector_id: connector['id'])
          @repository.write_gutter(object.entity, stored)
          sync_host_relationship(runtime, object, roof_object, stored.edge_index)
          runtime.smart_objects.mark_dirty(object.entity, 'dirty_quantity', 'dirty_drawing')
          runtime.smart_objects.mark_dirty(roof_object.entity, 'dirty_quantity', 'dirty_drawing')
          {
            created_object_ids: [],
            updated_object_ids: [object.id, roof_object.id].uniq,
            removed_object_ids: [],
            warnings: warnings.uniq,
            events: [
              { name: 'GutterChanged', object_ids: [object.id, roof_object.id], payload: { connector_id: connector['id'], source: extension_id, slot: SLOT } },
              { name: 'GeometryChanged', object_ids: [object.id] },
              { name: 'QuantityDirty', object_ids: [object.id, roof_object.id] },
              { name: 'DrawingDirty', object_ids: [object.id, roof_object.id] }
            ]
          }
        end

        def register_outlet(runtime, object, definition, roof_object, connector_id: nil)
          runtime.connectors.register_connector(
            owner_object_id: object.id,
            type: 'roof.gutter_outlet',
            role: 'outlet',
            position_mm: @edge_capability.point_on_edge_mm(roof_object, definition.edge_index, definition.outlet_ratio),
            direction: [0, 0, -1],
            properties: { gravity: true, roof_object_id: roof_object.id },
            connector_id: connector_id
          )
        end

        def sync_outlet(runtime, object, definition, roof_object)
          connector_id = definition.outlet_connector_id.to_s
          if connector_id.empty?
            return register_outlet(runtime, object, definition, roof_object)
          end

          position = @edge_capability.point_on_edge_mm(roof_object, definition.edge_index, definition.outlet_ratio)
          runtime.connectors.update_connector(
            connector_id,
            position_mm: position,
            direction: [0, 0, -1],
            properties: { gravity: true, roof_object_id: roof_object.id }
          )
        rescue KeyError
          register_outlet(runtime, object, definition, roof_object, connector_id: connector_id)
        end

        def sync_host_relationship(runtime, object, roof_object, edge_index)
          host_relations = Array(object.relationships).select do |relationship|
            (relationship['kind'] || relationship[:kind]).to_s == 'host' &&
              (relationship['role'] || relationship[:role]).to_s == 'roof_edge'
          end
          current = host_relations.find do |relationship|
            (relationship['target_id'] || relationship[:target_id]).to_s == roof_object.id.to_s &&
              (((relationship['metadata'] || relationship[:metadata]) || {})['edge_index'] ||
                ((relationship['metadata'] || relationship[:metadata]) || {})[:edge_index]).to_i == edge_index.to_i
          end
          return if current

          host_relations.each do |relationship|
            runtime.smart_objects.remove_relationship(
              object.entity,
              relationship_id: relationship['id'] || relationship[:id],
              kind: 'host',
              target_id: relationship['target_id'] || relationship[:target_id]
            )
          end
          runtime.smart_objects.add_relationship(
            object.entity,
            kind: 'host',
            target_id: roof_object.id,
            role: 'roof_edge',
            metadata: { 'capability' => 'roof.edge_host', 'edge_index' => edge_index }
          )
        end

        def find_generated(runtime, extension_id)
          runtime.smart_objects.all.find do |object|
            next false unless object.type.to_s == 'roof.gutter' && object.owner_module.to_s == 'constructflow.roof'

            Array(object.relationships).any? do |relationship|
              metadata = relationship['metadata'] || relationship[:metadata] || {}
              (relationship['kind'] || relationship[:kind]).to_s == RELATION_KIND &&
                (relationship['target_id'] || relationship[:target_id]).to_s == extension_id.to_s &&
                (relationship['role'] || relationship[:role]).to_s == RELATION_ROLE &&
                (metadata['slot'] || metadata[:slot]).to_s == SLOT
            end
          end
        end

        def explicit_profile?(request)
          request.is_a?(Hash) && (request.key?('profile_id') || request.key?(:profile_id))
        end

        def explicit_disabled?(request)
          request == false || %w[none disabled off].include?(request.to_s)
        end

        def no_op(message)
          {
            created_object_ids: [], updated_object_ids: [], removed_object_ids: [],
            warnings: [message], events: []
          }
        end

        def stringify_keys(value)
          value.each_with_object({}) { |(key, item), result| result[key.to_s] = item }
        end

        def fetch(hash, key)
          hash[key] || hash[key.to_s]
        end
      end
    end
  end
end
