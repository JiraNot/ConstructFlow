# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class DocumentationRepresentationProvider
        def initialize(repository: WallRepository.new)
          @repository = repository
        end

        def render(object:, request:)
          raise ArgumentError, "unsupported architecture documentation representation: #{object.type}" unless object.type.to_s == 'architecture.wall'

          definition = @repository.read(object.entity)
          raise ArgumentError, "missing wall definition for #{object.id}" unless definition

          case request['kind'].to_s
          when 'elevation' then render_elevation(object, definition, request)
          when 'section' then render_section(object, definition, request)
          else raise ArgumentError, "unsupported wall documentation kind: #{request['kind']}"
          end
        end

        private

        def render_elevation(object, definition, request)
          stations = station_points(definition.path_mm)
          base_z = definition.path_mm.map { |point| point[2] }.min
          outline = [
            [stations.first, 0.0, base_z],
            [stations.last, 0.0, base_z],
            [stations.last, 0.0, base_z + definition.height_mm],
            [stations.first, 0.0, base_z + definition.height_mm],
            [stations.first, 0.0, base_z]
          ]
          {
            primitives: [{ 'type' => 'closed_polyline', 'role' => 'wall_elevation', 'points_mm' => outline, 'style_role' => 'architecture_wall' }],
            annotations: [annotation('wall_tag', [stations.first, 0.0, base_z + definition.height_mm], 'WALL', object.id, 'elevation_start')],
            metadata: metadata(object, request).merge(
              'projection' => 'elevation', 'length_mm' => definition.length_mm,
              'height_mm' => definition.height_mm
            )
          }
        end

        def render_section(object, definition, request)
          base_z = definition.path_mm.map { |point| point[2] }.min
          half = definition.thickness_mm / 2.0
          outline = [
            [-half, 0.0, base_z], [half, 0.0, base_z],
            [half, 0.0, base_z + definition.height_mm],
            [-half, 0.0, base_z + definition.height_mm], [-half, 0.0, base_z]
          ]
          {
            primitives: [{ 'type' => 'closed_polyline', 'role' => 'wall_section', 'points_mm' => outline, 'style_role' => 'architecture_wall' }],
            annotations: [annotation('wall_section_tag', [0.0, 0.0, base_z + definition.height_mm], 'WALL SECTION', object.id, 'section_center')],
            metadata: metadata(object, request).merge(
              'projection' => 'section', 'thickness_mm' => definition.thickness_mm,
              'height_mm' => definition.height_mm
            )
          }
        end

        def station_points(path)
          distance = 0.0
          values = [0.0]
          Array(path).each_cons(2) do |first, second|
            dx = second[0] - first[0]
            dy = second[1] - first[1]
            distance += Math.sqrt((dx * dx) + (dy * dy))
            values << distance
          end
          values
        end

        def metadata(object, request)
          {
            'object_id' => object.id.to_s,
            'drawing_family' => 'architecture_documentation',
            'view' => request['view'], 'scale' => request['scale'],
            'phase_view' => request['phase_view'], 'lod' => request['lod']
          }
        end

        def annotation(role, anchor_mm, text, object_id, anchor_key)
          {
            'type' => 'text', 'role' => role, 'anchor_mm' => anchor_mm, 'text' => text,
            'status' => 'confirmed', 'source_object_id' => object_id.to_s, 'anchor_key' => anchor_key.to_s
          }
        end
      end
    end
  end
end
