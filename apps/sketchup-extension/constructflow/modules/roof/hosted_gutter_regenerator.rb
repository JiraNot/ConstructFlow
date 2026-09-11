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

            outlets = active_outlets(gutter, definition)
            raise ArgumentError, "gutter outlet connector missing: #{gutter.id}" if outlets.empty?

            # These calls deliberately raise when the persisted edge index is no
            # longer valid. Re-hosting to a different roof edge is a user intent
            # change and must never be guessed during regeneration.
            @geometry.rebuild_gutter!(
              gutter.entity,
              roof_object: roof_object,
              definition: definition,
              edge_capability: @edge_capability
            )

            outlet_positions = []
            refreshed_downpipes = []
            outlets.each do |outlet|
              ratio = outlet_ratio(outlet, definition)
              outlet_position = @edge_capability.point_on_edge_mm(
                roof_object, definition.edge_index, ratio
              )
              properties = outlet.fetch('properties', {}).merge(
                'gravity' => true,
                'roof_object_id' => roof_object.id,
                'outlet_ratio' => ratio
              )
              @runtime.connectors.update_connector(
                outlet['id'],
                position_mm: outlet_position,
                properties: properties
              )
              outlet_positions << {
                'connector_id' => outlet['id'],
                'outlet_ratio' => ratio,
                'position_mm' => outlet_position
              }.freeze
              refreshed_downpipes.concat(refresh_connected_downpipes(outlet['id']))
            end

            @runtime.smart_objects.mark_dirty(gutter.entity, 'dirty_quantity', 'dirty_drawing')
            gutter_ids << gutter.id
            refreshed_downpipes = refreshed_downpipes.uniq
            downpipe_ids.concat(refreshed_downpipes)
            primary = outlet_positions.find { |item| item['connector_id'].to_s == definition.outlet_connector_id.to_s } || outlet_positions.first
            events << {
              name: 'HostedGutterRegenerated',
              object_ids: [roof_object.id, gutter.id, *refreshed_downpipes].uniq,
              payload: {
                roof_id: roof_object.id,
                gutter_id: gutter.id,
                edge_index: definition.edge_index,
                outlet_connector_id: primary['connector_id'],
                outlet_position_mm: primary['position_mm'],
                outlet_positions: outlet_positions,
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

        def active_outlets(gutter, definition)
          values = @runtime.connectors.connectors_for(gutter.id).select do |connector|
            connector['type'].to_s == 'roof.gutter_outlet' && connector['state'].to_s != 'disabled'
          end
          if values.empty? && !definition.outlet_connector_id.to_s.empty?
            values = [@runtime.connectors.connector(definition.outlet_connector_id)]
          end
          values.sort_by do |connector|
            properties = connector.fetch('properties', {})
            index = properties['outlet_index'] || properties[:outlet_index]
            [index.nil? ? 10_000 : Integer(index), connector['id'].to_s]
          end.freeze
        end

        def outlet_ratio(connector, definition)
          properties = connector.fetch('properties', {})
          value = properties['outlet_ratio'] || properties[:outlet_ratio]
          value = definition.outlet_ratio if value.nil? && connector['id'].to_s == definition.outlet_connector_id.to_s
          raise ArgumentError, "gutter outlet ratio missing: #{connector['id']}" if value.nil?

          ratio = Float(value)
          raise ArgumentError, "invalid gutter outlet ratio: #{ratio}" unless ratio.between?(0.0, 1.0)
          ratio
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

if defined?(JiraNot::ConstructFlow::Roof::Registration) &&
   !JiraNot::ConstructFlow::Roof::Registration.singleton_class.ancestors.include?(
     JiraNot::ConstructFlow::Roof::HostedRainwaterRegenerationPatch
   )
  JiraNot::ConstructFlow::Roof::Registration.singleton_class.prepend(
    JiraNot::ConstructFlow::Roof::HostedRainwaterRegenerationPatch
  )
end
