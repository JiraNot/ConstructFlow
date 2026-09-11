# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      class PlanRepresentationProvider
        def initialize(runtime:, repository: Repository.new)
          @runtime = runtime
          @repository = repository
        end

        def render(object:, request:)
          case object.type.to_s
          when 'roof.system'
            render_roof(object, request)
          when 'roof.gutter'
            render_gutter(object, request)
          else
            raise ArgumentError, "unsupported roof plan representation: #{object.type}"
          end
        end

        private

        def render_roof(object, request)
          definition = @repository.read_roof(object.entity)
          raise ArgumentError, "missing roof definition for #{object.id}" unless definition
          profile = representation_profile(request)
          boundary = definition.sloped_points_mm
          center = polygon_center(boundary)
          slope_end = slope_marker_end(center, definition.slope_direction_xy)

          primitives = [
            {
              'type' => 'closed_polyline',
              'role' => 'roof_boundary',
              'points_mm' => boundary + [boundary.first],
              'style_role' => 'roof_outline'
            }
          ]
          unless definition.roof_form == 'flat' && definition.slope_percent.zero?
            primitives << {
              'type' => 'flow_arrow',
              'role' => 'roof_slope_direction',
              'from_mm' => center,
              'to_mm' => slope_end,
              'style_role' => 'roof_slope'
            }
          end

          annotations = [annotation('roof_form', center, definition.roof_form.to_s.upcase)]
          if profile != 'simple'
            annotations << annotation('roof_slope', center, "S=#{format_number(definition.slope_percent)}%")
            annotations << annotation('covering_system', center, definition.covering_system.to_s.upcase)
          end
          if profile == 'coordination'
            annotations << annotation('low_elevation', center, "LOW #{format_number(definition.low_elevation_mm)}")
            if definition.generated_from_id && !definition.generated_from_id.empty?
              annotations << annotation('generated_from', center, "FROM #{definition.generated_from_id}")
            end
          end

          {
            primitives: primitives,
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'roof_form' => definition.roof_form,
              'covering_system' => definition.covering_system,
              'slope_percent' => definition.slope_percent,
              'plan_area_mm2' => definition.plan_area_mm2
            )
          }
        end

        def render_gutter(object, request)
          definition = @repository.read_gutter(object.entity)
          raise ArgumentError, "missing gutter definition for #{object.id}" unless definition
          roof = @runtime.smart_objects.fetch_by_id(definition.roof_object_id)
          raise ArgumentError, "missing gutter roof host #{definition.roof_object_id}" unless roof
          roof_definition = @repository.read_roof(roof.entity)
          raise ArgumentError, "missing roof definition for gutter host #{definition.roof_object_id}" unless roof_definition

          profile = representation_profile(request)
          edge = roof_definition.edge_points_mm(definition.edge_index)
          outlets = active_outlets(object, definition, edge)
          primitives = [
            {
              'type' => 'polyline',
              'role' => 'gutter_path',
              'points_mm' => edge,
              'style_role' => 'roof_gutter'
            }
          ]
          annotations = []
          outlets.each_with_index do |outlet, index|
            position = outlet.fetch('position_mm')
            primitives << {
              'type' => 'symbol',
              'role' => 'gutter_outlet',
              'symbol' => 'GO',
              'position_mm' => position,
              'style_role' => 'roof_gutter',
              'connector_id' => outlet['id']
            }
            annotations << annotation('gutter_tag', position, index.zero? ? 'GUTTER' : "OUT #{index + 1}")
            if profile == 'coordination'
              annotations << annotation('outlet_connector', position, "OUT #{outlet['id']}") unless outlet['id'].to_s.empty?
            end
          end
          anchor = outlets.first ? outlets.first['position_mm'] : interpolate(edge[0], edge[1], definition.outlet_ratio)
          if profile != 'simple'
            annotations << annotation('gutter_profile', anchor, definition.profile_id)
          end
          if profile == 'coordination'
            annotations << annotation('roof_host', anchor, "ROOF #{definition.roof_object_id}")
          end

          {
            primitives: primitives,
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'roof_object_id' => definition.roof_object_id,
              'edge_index' => definition.edge_index,
              'profile_id' => definition.profile_id,
              'outlet_ratio' => definition.outlet_ratio,
              'outlet_connector_ids' => outlets.map { |outlet| outlet['id'] }.reject(&:empty?).freeze,
              'outlet_count' => outlets.length
            )
          }
        end

        def active_outlets(object, definition, edge)
          connectors = if @runtime.respond_to?(:connectors)
                         @runtime.connectors.connectors_for(object.id).select do |connector|
                           connector['type'].to_s == 'roof.gutter_outlet' && connector['state'].to_s != 'disabled'
                         end
                       else
                         []
                       end
          values = connectors.map do |connector|
            properties = connector.fetch('properties', {})
            ratio = properties['outlet_ratio'] || properties[:outlet_ratio]
            ratio = definition.outlet_ratio if ratio.nil? && connector['id'].to_s == definition.outlet_connector_id.to_s
            next if ratio.nil?
            connector.merge('position_mm' => interpolate(edge[0], edge[1], Float(ratio)))
          end.compact
          if values.empty?
            values = [{
              'id' => definition.outlet_connector_id.to_s,
              'position_mm' => interpolate(edge[0], edge[1], definition.outlet_ratio),
              'properties' => { 'outlet_ratio' => definition.outlet_ratio }
            }]
          end
          values.sort_by do |outlet|
            properties = outlet.fetch('properties', {})
            index = properties['outlet_index'] || properties[:outlet_index]
            ratio = properties['outlet_ratio'] || properties[:outlet_ratio] || definition.outlet_ratio
            [index.nil? ? 10_000 : Integer(index), Float(ratio), outlet['id'].to_s]
          end.freeze
        rescue StandardError
          [{
            'id' => definition.outlet_connector_id.to_s,
            'position_mm' => interpolate(edge[0], edge[1], definition.outlet_ratio),
            'properties' => { 'outlet_ratio' => definition.outlet_ratio }
          }].freeze
        end

        def representation_profile(request)
          lod = request['lod'].to_s
          style = request.dig('context', 'style_preset').to_s
          return 'simple' if lod == 'simple' || style.end_with?('.simple')
          return 'coordination' if lod == 'coordination' || style.end_with?('.coordination')
          'construction'
        end

        def common_metadata(request)
          {
            'view' => request['view'],
            'scale' => request['scale'],
            'phase_view' => request['phase_view'],
            'lod' => request['lod'],
            'style_preset' => request.dig('context', 'style_preset'),
            'drawing_family' => 'roof_plan'
          }
        end

        def polygon_center(points)
          return [0.0, 0.0, 0.0] if points.empty?
          count = points.length.to_f
          [points.sum { |point| point[0] } / count, points.sum { |point| point[1] } / count, points.sum { |point| point[2] } / count]
        end

        def slope_marker_end(center, direction)
          length = 500.0
          [center[0] + (direction[0] * length), center[1] + (direction[1] * length), center[2]]
        end

        def interpolate(a, b, ratio)
          r = Float(ratio)
          [a[0] + ((b[0] - a[0]) * r), a[1] + ((b[1] - a[1]) * r), a[2] + ((b[2] - a[2]) * r)]
        end

        def annotation(role, anchor_mm, text, status: 'confirmed')
          { 'type' => 'text', 'role' => role, 'anchor_mm' => anchor_mm, 'text' => text.to_s, 'status' => status }
        end

        def format_number(value)
          rounded = Float(value).round(2)
          rounded == rounded.to_i ? rounded.to_i.to_s : rounded.to_s
        end
      end
    end
  end
end
