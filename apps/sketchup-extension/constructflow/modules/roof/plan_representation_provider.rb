# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      class PlanRepresentationProvider
        def initialize(repository: Repository.new)
          @repository = repository
        end

        def render(object:, request:)
          case object.type.to_s
          when 'roof.system'
            render_roof(object, request)
          else
            raise ArgumentError, "unsupported roof plan representation: #{object.type}"
          end
        end

        private

        def render_roof(object, request)
          definition = @repository.read_roof(object.entity)
          raise ArgumentError, "missing roof definition for #{object.id}" unless definition

          profile = representation_profile(request)
          boundary = definition.boundary_mm
          centroid = polygon_centroid(boundary)
          slope_end = [
            centroid[0] + (definition.slope_direction_xy[0] * slope_arrow_length(boundary)),
            centroid[1] + (definition.slope_direction_xy[1] * slope_arrow_length(boundary)),
            centroid[2]
          ]

          primitives = [
            {
              'type' => 'closed_polyline',
              'role' => 'roof_boundary',
              'points_mm' => boundary + [boundary.first],
              'style_role' => 'roof_outline'
            }
          ]
          if profile != 'simple'
            primitives << {
              'type' => 'flow_arrow',
              'role' => 'roof_slope_direction',
              'from_mm' => centroid,
              'to_mm' => slope_end,
              'style_role' => 'roof_slope'
            }
          end

          annotations = [annotation('roof_form', centroid, definition.roof_form.to_s.upcase)]
          if profile != 'simple'
            annotations << annotation('roof_slope', centroid, "S=#{format_number(definition.slope_percent, 1)}%")
            annotations << annotation('roof_covering', centroid, definition.covering_system.to_s.upcase.tr('_', ' '))
          end
          if profile == 'coordination' && definition.generated_from_id
            annotations << annotation('generated_from', centroid, "FROM #{definition.generated_from_id}")
          end

          {
            primitives: primitives,
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'roof_form' => definition.roof_form,
              'slope_percent' => definition.slope_percent,
              'slope_direction_xy' => definition.slope_direction_xy,
              'covering_system' => definition.covering_system,
              'generated_from_id' => definition.generated_from_id,
              'plan_area_mm2' => definition.plan_area_mm2
            )
          }
        end

        def representation_profile(request)
          lod = request['lod'].to_s
          style = request.dig('context', 'style_preset').to_s
          return 'simple' if lod == 'simple' || style.end_with?('.simple')
          return 'coordination' if lod == 'coordination' || style.end_with?('.coordination')
          'construction'
        end

        def polygon_centroid(points)
          return [0.0, 0.0, 0.0] if points.empty?
          count = points.length.to_f
          [
            points.sum { |point| point[0] } / count,
            points.sum { |point| point[1] } / count,
            points.sum { |point| point[2] } / count
          ]
        end

        def slope_arrow_length(points)
          xs = points.map { |point| point[0] }
          ys = points.map { |point| point[1] }
          span = [xs.max.to_f - xs.min.to_f, ys.max.to_f - ys.min.to_f].reject(&:zero?).min || 1000.0
          [span * 0.25, 500.0].max
        end

        def annotation(role, anchor_mm, text, status: 'confirmed')
          {
            'type' => 'text',
            'role' => role,
            'anchor_mm' => anchor_mm,
            'text' => text,
            'status' => status
          }
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

        def format_number(value, precision)
          format("%.#{precision}f", Float(value).round(precision))
        end
      end
    end
  end
end
