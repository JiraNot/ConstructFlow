# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class IntermediateManholeService
        def initialize(runtime:, repository: Repository.new, geometry: Geometry.new, planner: IntermediateManholePlanner.new,
                       validator: Validators::DrainageValidator.new)
          @runtime = runtime
          @repository = repository
          @geometry = geometry
          @planner = planner
          @validator = validator
        end

        def insert(route_object:, segment_index:, segment_ratio: 0.5, size_mm: ManholeDefinition::DEFAULT_SIZE_MM,
                   cover_level_mm: nil, manhole_type: 'inspection', display_name: 'Intermediate Manhole')
          definition = @repository.read_pipe_route(route_object.entity)
          raise ArgumentError, 'drainage route definition missing' unless definition
          split = @planner.split(definition: definition, segment_index: segment_index, segment_ratio: segment_ratio)

          manhole, manhole_definition = Registration.create_manhole_object(
            @runtime, @repository, @geometry,
            {
              location_mm: split.location_mm,
              size_mm: size_mm,
              cover_level_mm: cover_level_mm,
              invert_in_mm: split.invert_mm,
              invert_out_mm: split.invert_mm,
              manhole_type: manhole_type,
              display_name: display_name,
              source_state: split.invert_mm.nil? ? 'verify_on_site' : 'confirmed'
            },
            created_phase: Core::Phase::NEW_CONSTRUCTION
          )

          result = if route_object.created_phase == Core::Phase::EXISTING
                     replace_existing_route(route_object, definition, split, manhole, manhole_definition)
                   else
                     split_proposed_route(route_object, definition, split, manhole, manhole_definition)
                   end
          result.merge(
            manhole_id: manhole.id,
            warnings: Array(result[:warnings]).uniq,
            split: split.to_h
          ).freeze
        end

        private

        def replace_existing_route(route_object, definition, split, manhole, manhole_definition)
          @runtime.smart_objects.update_lifecycle(route_object.entity, removed_phase: Core::Phase::DEMOLITION)
          @runtime.smart_objects.mark_dirty(route_object.entity, 'dirty_quantity', 'dirty_drawing')
          @runtime.connectors.disconnect(definition.connection_id) if definition.connection_id

          upstream, upstream_definition, = create_segment(
            definition: definition,
            nodes: split.upstream_nodes_mm,
            start_connector_id: definition.start_connector_id,
            end_connector_id: manhole_definition.inlet_connector_id,
            start_invert_mm: definition.start_invert_mm,
            end_invert_mm: split.invert_mm,
            created_phase: Core::Phase::NEW_CONSTRUCTION,
            display_name: 'Drainage Route - Upstream Split'
          )
          downstream, downstream_definition, = create_segment(
            definition: definition,
            nodes: split.downstream_nodes_mm,
            start_connector_id: manhole_definition.outlet_connector_id,
            end_connector_id: definition.end_connector_id,
            start_invert_mm: split.invert_mm,
            end_invert_mm: definition.end_invert_mm,
            created_phase: Core::Phase::NEW_CONSTRUCTION,
            display_name: 'Drainage Route - Downstream Split'
          )
          link_replacement(route_object, upstream, 'upstream')
          link_replacement(route_object, downstream, 'downstream')
          affected = [route_object.id, manhole.id, upstream.id, downstream.id]
          {
            created_ids: [manhole.id, upstream.id, downstream.id],
            updated_ids: affected,
            route_ids: [upstream.id, downstream.id],
            warnings: validation_warnings(upstream_definition) + validation_warnings(downstream_definition)
          }
        end

        def split_proposed_route(route_object, definition, split, manhole, manhole_definition)
          @runtime.connectors.disconnect(definition.connection_id) if definition.connection_id
          upstream_connection = @runtime.connectors.register_connection(
            from_connector_id: definition.start_connector_id,
            to_connector_id: manhole_definition.inlet_connector_id,
            system: "drainage.#{definition.system}",
            metadata: { route_object_id: route_object.id }
          )
          upstream_definition = definition.with(
            route_nodes_mm: split.upstream_nodes_mm,
            end_connector_id: manhole_definition.inlet_connector_id,
            end_invert_mm: split.invert_mm,
            route_strategy: 'manual',
            connection_id: upstream_connection['id']
          )
          @geometry.rebuild_pipe!(route_object.entity, upstream_definition)
          @repository.write_pipe_route(route_object.entity, upstream_definition)
          replace_endpoint_relationship(route_object, definition.end_connector_id, manhole.id, manhole_definition.inlet_connector_id)
          @runtime.smart_objects.mark_dirty(route_object.entity, 'dirty_quantity', 'dirty_drawing')

          downstream, downstream_definition, = create_segment(
            definition: definition,
            nodes: split.downstream_nodes_mm,
            start_connector_id: manhole_definition.outlet_connector_id,
            end_connector_id: definition.end_connector_id,
            start_invert_mm: split.invert_mm,
            end_invert_mm: definition.end_invert_mm,
            created_phase: route_object.created_phase,
            display_name: 'Drainage Route - Downstream Split'
          )
          @runtime.smart_objects.add_relationship(route_object.entity, kind: 'continues_as', target_id: downstream.id, role: 'split_downstream')
          @runtime.smart_objects.add_relationship(downstream.entity, kind: 'split_from', target_id: route_object.id, role: 'split_downstream')
          affected = [route_object.id, manhole.id, downstream.id]
          {
            created_ids: [manhole.id, downstream.id],
            updated_ids: affected,
            route_ids: [route_object.id, downstream.id],
            warnings: validation_warnings(upstream_definition) + validation_warnings(downstream_definition)
          }
        end

        def create_segment(definition:, nodes:, start_connector_id:, end_connector_id:, start_invert_mm:, end_invert_mm:,
                           created_phase:, display_name:)
          Registration.create_pipe_route_object(
            @runtime, @repository, @geometry,
            {
              system: definition.system,
              diameter_mm: definition.diameter_mm,
              route_nodes_mm: nodes,
              start_connector_id: start_connector_id,
              end_connector_id: end_connector_id,
              start_invert_mm: start_invert_mm,
              end_invert_mm: end_invert_mm,
              material: definition.material,
              route_strategy: 'manual',
              source_state: start_invert_mm.nil? || end_invert_mm.nil? ? 'verify_on_site' : 'confirmed',
              display_name: display_name
            },
            created_phase: created_phase
          )
        end

        def link_replacement(old_route, new_route, segment)
          metadata = { reason: 'intermediate_manhole_split', segment: segment }
          @runtime.smart_objects.add_relationship(old_route.entity, kind: 'replaced_by', target_id: new_route.id, role: 'route_split', metadata: metadata)
          @runtime.smart_objects.add_relationship(new_route.entity, kind: 'replaces', target_id: old_route.id, role: 'route_split', metadata: metadata)
        end

        def replace_endpoint_relationship(route_object, old_connector_id, new_owner_id, new_connector_id)
          old_owner = @runtime.connectors.connector(old_connector_id)['owner_object_id']
          @runtime.smart_objects.remove_relationship(route_object.entity, kind: 'connects_to', target_id: old_owner)
          @runtime.smart_objects.add_relationship(
            route_object.entity,
            kind: 'connects_to', target_id: new_owner_id, role: 'drainage_endpoint',
            metadata: { connector_id: new_connector_id }
          )
        end

        def validation_warnings(definition)
          Registration.warning_messages(@validator.validate_route(definition))
        end
      end
    end
  end
end
