# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      # Keeps Roof-owned gutter geometry and outlet connector positions converged
      # with the current host Roof definition. Connected downpipe regeneration is
      # delegated to the Drainage capability so Roof never mutates Drainage
      # geometry or topology directly.
      class HostedGutterRegenerator
        DRAINAGE_CAPABILITY = 'drainage.rainwater_downpipe'
        RAINWATER_SYSTEM = 'drainage.rainwater'

        def initialize(runtime:, repository: Repository.new, geometry: Geometry.new,
                       edge_capability: nil)
          @runtime = runtime
          @repository = repository
          @geometry = geometry
          @edge_capability = edge_capability || EdgeHostCapability.new(repository: repository)
        end

        def refresh(roof_object)
          raise ArgumentError, 'compatible roof object required' unless @edge_capability.compatible?(roof_object)

          gutter_ids = []
          downpipe_ids = []
          events = []
          hosted_gutters(roof_object).each do |gutter|
            definition = @repository.read_gutter(gutter.entity)
            raise ArgumentError, "gutter definition missing: #{gutter.id}" unless definition
            if definition.outlet_connector_id.to_s.empty?
              raise ArgumentError, "gutter outlet connector missing: #{gutter.id}"
            end

            # These calls deliberately raise when the persisted edge index is no
            # longer valid. Re-hosting to a different roof edge is a user intent
            # change and must never be guessed during regeneration.
            @geometry.rebuild_gutter!(
              gutter.entity,
              roof_object: roof_object,
              definition: definition,
              edge_capability: @edge_capability
            )
            outlet_position = @edge_capability.point_on_edge_mm(
              roof_object, definition.edge_index, definition.outlet_ratio
            )
            @runtime.connectors.update_connector(
              definition.outlet_connector_id,
              position_mm: outlet_position
            )
            @runtime.smart_objects.mark_dirty(gutter.entity, 'dirty_quantity', 'dirty_drawing')
            gutter_ids << gutter.id

            refreshed_downpipes = refresh_connected_downpipes(definition.outlet_connector_id)
            downpipe_ids.concat(refreshed_downpipes)
            events << {
              name: 'HostedGutterRegenerated',
              object_ids: [roof_object.id, gutter.id, *refreshed_downpipes].uniq,
              payload: {
                roof_id: roof_object.id,
                gutter_id: gutter.id,
                edge_index: definition.edge_index,
                outlet_connector_id: definition.outlet_connector_id,
                outlet_position_mm: outlet_position,
                downpipe_ids: refreshed_downpipes
              }
            }
          end

          affected = (gutter_ids + downpipe_ids).uniq
          unless affected.empty?
            events << { name: 'QuantityDirty', object_ids: affected }
            events << { name: 'DrawingDirty', object_ids: affected }
          end

          {
            updated_object_ids: affected.freeze,
            gutter_object_ids: gutter_ids.uniq.freeze,
            downpipe_object_ids: downpipe_ids.uniq.freeze,
            warnings: [].freeze,
            events: events.freeze
          }.freeze
        end

        private

        def hosted_gutters(roof_object)
          @runtime.smart_objects.all.select do |object|
            next false unless object.owner_module == 'constructflow.roof' && object.type == 'roof.gutter'

            definition = @repository.read_gutter(object.entity)
            definition && definition.roof_object_id.to_s == roof_object.id.to_s
          end
        end

        def refresh_connected_downpipes(outlet_connector_id)
          connections = @runtime.connectors.connections_for_connector(outlet_connector_id).select do |connection|
            connection['system'].to_s == RAINWATER_SYSTEM &&
              connection.fetch('metadata', {})['route_kind'].to_s == 'downpipe'
          end
          return [] if connections.empty?

          unless @runtime.capabilities.available?(DRAINAGE_CAPABILITY)
            raise ArgumentError, 'drainage rainwater downpipe capability unavailable for connected gutter regeneration'
          end

          service = @runtime.capabilities.fetch(DRAINAGE_CAPABILITY)
          result = service.refresh_for_start_connector(start_connector_id: outlet_connector_id)
          Array(result[:updated_object_ids] || result['updated_object_ids']).map(&:to_s).uniq
        end
      end

      # Roof::Registration commands are installed by main.rb before bootstrap
      # loads the cross-domain rainwater layer. Prepending this singleton patch
      # lets the existing ModifyRoofBoundary/SetRoofSlope/ChangeRoofSystem command
      # handlers keep their transaction boundary while extending update_roof with
      # hosted-output convergence.
      module HostedRainwaterRegenerationPatch
        def update_roof(input:, runtime:, repository:, geometry:, validator:, change:, &block)
          base = super
          roof_object = resolve_roof(input, runtime)
          propagation = HostedGutterRegenerator.new(
            runtime: runtime,
            repository: repository,
            geometry: geometry
          ).refresh(roof_object)

          {
            updated_object_ids: (Array(base[:updated_object_ids]) + Array(propagation[:updated_object_ids])).uniq,
            warnings: (Array(base[:warnings]) + Array(propagation[:warnings])).uniq,
            events: Array(base[:events]) + Array(propagation[:events])
          }
        end
      end
    end
  end
end

unless JiraNot::ConstructFlow::Roof::Registration.singleton_class.ancestors.include?(
  JiraNot::ConstructFlow::Roof::HostedRainwaterRegenerationPatch
)
  JiraNot::ConstructFlow::Roof::Registration.singleton_class.prepend(
    JiraNot::ConstructFlow::Roof::HostedRainwaterRegenerationPatch
  )
end
