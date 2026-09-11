# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      # Rebuilds semantic gutters against their stable roof edge index and moves
      # the existing outlet connector instead of creating a replacement ID.
      class HostedGutterRegenerator
        POSITION_TOLERANCE_MM = 0.001

        def initialize(runtime:, repository: Repository.new, geometry: Geometry.new, edge_capability: nil)
          @runtime = runtime
          @repository = repository
          @geometry = geometry
          @edge_capability = edge_capability || EdgeHostCapability.new(repository: repository)
        end

        def regenerate(roof_object_id:)
          roof = @runtime.smart_objects.fetch_by_id(roof_object_id.to_s)
          raise ArgumentError, 'roof not found' unless @edge_capability.compatible?(roof)

          regenerated = []
          moved_outlets = []
          invalid = []
          hosted_gutters(roof.id).each do |gutter|
            definition = @repository.read_gutter(gutter.entity)
            unless definition
              invalid << invalid_record(gutter, 'gutter definition missing')
              dirty_invalid(gutter)
              next
            end

            begin
              outlet_position = @edge_capability.point_on_edge_mm(
                roof, definition.edge_index, definition.outlet_ratio
              )
              @geometry.rebuild_gutter!(
                gutter.entity,
                roof_object: roof,
                definition: definition,
                edge_capability: @edge_capability
              )
              moved = update_outlet_connector(definition, outlet_position)
              @runtime.smart_objects.mark_dirty(gutter.entity, 'dirty_quantity', 'dirty_drawing')
              regenerated << gutter.id
              moved_outlets << moved.merge('gutter_id' => gutter.id) if moved
            rescue ArgumentError => error
              invalid << invalid_record(gutter, error.message)
              dirty_invalid(gutter)
            end
          end

          {
            'roof_object_id' => roof.id,
            'regenerated_gutter_ids' => regenerated.freeze,
            'moved_outlets' => moved_outlets.freeze,
            'invalid_gutters' => invalid.freeze
          }.freeze
        end

        private

        def hosted_gutters(roof_id)
          @runtime.smart_objects.all.select do |object|
            next false unless object.owner_module == 'constructflow.roof' && object.type == 'roof.gutter'
            definition = @repository.read_gutter(object.entity)
            definition && definition.roof_object_id == roof_id.to_s
          end.sort_by(&:id)
        end

        def update_outlet_connector(definition, outlet_position)
          connector_id = definition.outlet_connector_id.to_s
          raise ArgumentError, 'gutter outlet connector missing' if connector_id.empty?

          connector = @runtime.connectors.connector(connector_id)
          previous = Array(connector['position_mm'])
          next_position = Array(outlet_position).map { |value| Float(value) }
          @runtime.connectors.update_connector(connector_id, position_mm: next_position)
          return nil if same_point?(previous, next_position)

          {
            'connector_id' => connector_id,
            'previous_position_mm' => previous.freeze,
            'position_mm' => next_position.freeze
          }.freeze
        rescue KeyError
          raise ArgumentError, "gutter outlet connector not found: #{connector_id}"
        end

        def dirty_invalid(gutter)
          @runtime.smart_objects.mark_dirty(
            gutter.entity,
            'dirty_geometry', 'dirty_quantity', 'dirty_drawing'
          )
        end

        def invalid_record(gutter, message)
          {
            'gutter_id' => gutter.id,
            'message' => message.to_s
          }.freeze
        end

        def same_point?(a, b)
          return false unless Array(a).length >= 3 && Array(b).length >= 3
          Array(a).first(3).zip(Array(b).first(3)).all? do |left, right|
            (Float(left) - Float(right)).abs <= POSITION_TOLERANCE_MM
          end
        end
      end
    end
  end
end
