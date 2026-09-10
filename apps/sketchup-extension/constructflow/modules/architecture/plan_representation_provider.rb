# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class PlanRepresentationProvider
        def initialize(repository: WallRepository.new)
          @repository = repository
        end

        def render(object:, request:)
          raise ArgumentError, "unsupported architecture plan representation: #{object.type}" unless object.type.to_s == 'architecture.wall'
          definition = @repository.read(object.entity)
          raise ArgumentError, "missing wall definition for #{object.id}" unless definition

          profile = representation_profile(request)
          primitives = [
            {
              'type' => 'polyline',
              'role' => 'wall_centerline',
              'points_mm' => definition.path_mm,
              'style_role' => 'architecture_wall'
            }
          ]
          if profile != 'simple'
            primitives.concat(offset_wall_lines(definition))
          end

          center = path_midpoint(definition.path_mm)
          annotations = [annotation('wall_tag', center, 'WALL')]
          if profile != 'simple'
            annotations << annotation('wall_type', center, definition.wall_type_id)
            annotations << annotation('wall_thickness', center, "T #{format_number(definition.thickness_mm)}")
          end
          if profile == 'coordination'
            annotations << annotation('wall_height', center, "H #{format_number(definition.height_mm)}")
            annotations << annotation('geometry_mode', center, definition.geometry_mode.to_s.upcase)
            annotations << annotation('opening_count', center, "OPENINGS #{@repository.host_openings(object.entity).length}")
          end

          {
            primitives: primitives,
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'wall_type_id' => definition.wall_type_id,
              'thickness_mm' => definition.thickness_mm,
              'height_mm' => definition.height_mm,
              'length_mm' => definition.length_mm,
              'orientation' => definition.orientation,
              'geometry_mode' => definition.geometry_mode
            )
          }
        end

        private

        def offset_wall_lines(definition)
          half = definition.thickness_mm / 2.0
          lines = []
          definition.path_mm.each_cons(2) do |a, b|
            dx = b[0] - a[0]
            dy = b[1] - a[1]
            length = Math.sqrt((dx * dx) + (dy * dy))
            next if length <= 0.001
            nx = -dy / length
            ny = dx / length
            lines << {
              'type' => 'polyline', 'role' => 'wall_face', 'style_role' => 'architecture_wall_face',
              'points_mm' => [[a[0] + (nx * half), a[1] + (ny * half), a[2]], [b[0] + (nx * half), b[1] + (ny * half), b[2]]]
            }
            lines << {
              'type' => 'polyline', 'role' => 'wall_face', 'style_role' => 'architecture_wall_face',
              'points_mm' => [[a[0] - (nx * half), a[1] - (ny * half), a[2]], [b[0] - (nx * half), b[1] - (ny * half), b[2]]]
            }
          end
          lines
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
            'view' => request['view'], 'scale' => request['scale'], 'phase_view' => request['phase_view'],
            'lod' => request['lod'], 'style_preset' => request.dig('context', 'style_preset'),
            'drawing_family' => 'architecture_plan'
          }
        end

        def path_midpoint(points)
          values = Array(points)
          return [0.0, 0.0, 0.0] if values.empty?
          return values.first if values.length == 1
          a = values[(values.length - 1) / 2]
          b = values[values.length / 2]
          [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0, (a[2] + b[2]) / 2.0]
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
