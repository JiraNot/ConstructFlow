# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Electrical
      class PlanRepresentationProvider
        SYMBOLS = {
          'luminaire' => 'L', 'switch' => 'S', 'outlet' => 'SO',
          'dedicated_outlet' => 'DO', 'data' => 'DATA', 'tv' => 'TV'
        }.freeze

        def initialize(runtime:, repository: Repository.new)
          @runtime = runtime
          @repository = repository
        end

        def render(object:, request:)
          definition = @repository.read_device(object.entity)
          raise ArgumentError, "missing electrical device definition for #{object.id}" unless definition
          profile = representation_profile(request)
          symbol = SYMBOLS.fetch(definition.kind, 'E')
          annotations = [annotation('schedule_mark', definition.position_mm, definition.schedule_mark.to_s.empty? ? symbol : definition.schedule_mark)]

          if profile != 'simple'
            annotations << annotation('device_type', definition.position_mm, definition.device_type.to_s.upcase)
            annotations << annotation('circuit', definition.position_mm, "CKT #{definition.circuit_id}") if definition.circuit_id && !definition.circuit_id.empty?
            annotations << annotation('wattage', definition.position_mm, "#{format_number(definition.wattage)}W") if definition.wattage
          end
          if profile == 'coordination'
            annotations << annotation('host', definition.position_mm, "HOST #{definition.host_object_id}") if definition.host_object_id && !definition.host_object_id.empty?
            annotations << annotation('level', definition.position_mm, "LEVEL #{definition.level_id}") if definition.level_id && !definition.level_id.empty?
            annotations << annotation('mounting', definition.position_mm, "#{definition.mounting.upcase} #{format_number(definition.mounting_height_mm)}")
          end

          controls = control_targets(object.id)
          primitives = [{
            'type' => 'symbol', 'role' => 'electrical_device', 'symbol' => symbol,
            'position_mm' => definition.position_mm, 'style_role' => "electrical_#{definition.kind}"
          }]
          if definition.kind == 'switch' && profile != 'simple'
            controls.each do |target|
              primitives << {
                'type' => 'polyline', 'role' => 'control_relation',
                'points_mm' => [definition.position_mm, target[:position_mm]],
                'style_role' => 'electrical_control'
              }
            end
          end

          {
            primitives: primitives,
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'kind' => definition.kind,
              'device_type' => definition.device_type,
              'circuit_id' => definition.circuit_id,
              'host_object_id' => definition.host_object_id,
              'control_target_ids' => controls.map { |item| item[:id] }
            )
          }
        end

        private

        def control_targets(switch_id)
          relation = @repository.control_relations(@runtime.active_model).find { |item| item['switch_object_id'].to_s == switch_id.to_s }
          return [] unless relation
          Array(relation['load_object_ids']).filter_map do |id|
            object = @runtime.smart_objects.fetch_by_id(id)
            next unless object
            definition = @repository.read_device(object.entity)
            next unless definition
            { id: id.to_s, position_mm: definition.position_mm }
          end
        end

        def representation_profile(request)
          lod = request['lod'].to_s
          style = request.dig('context', 'style_preset').to_s
          return 'simple' if lod == 'simple' || style.end_with?('.simple')
          return 'coordination' if lod == 'coordination' || style.end_with?('.coordination')
          'construction'
        end

        def annotation(role, anchor, text)
          { 'type' => 'text', 'role' => role, 'anchor_mm' => anchor, 'text' => text.to_s, 'status' => 'confirmed' }
        end

        def common_metadata(request)
          {
            'view' => request['view'], 'scale' => request['scale'], 'phase_view' => request['phase_view'],
            'lod' => request['lod'], 'style_preset' => request.dig('context', 'style_preset'),
            'drawing_family' => 'electrical_plan'
          }
        end

        def format_number(value)
          rounded = Float(value).round(2)
          rounded == rounded.to_i ? rounded.to_i.to_s : rounded.to_s
        end
      end
    end
  end
end
