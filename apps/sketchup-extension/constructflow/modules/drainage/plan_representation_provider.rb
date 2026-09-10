# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class PlanRepresentationProvider
        def initialize(repository: Repository.new)
          @repository = repository
        end

        def render(object:, request:)
          case object.type.to_s
          when 'drainage.pipe_route'
            render_pipe_route(object, request)
          when 'drainage.manhole'
            render_manhole(object, request)
          else
            raise ArgumentError, "unsupported drainage plan representation: #{object.type}"
          end
        end

        private

        def render_pipe_route(object, request)
          definition = @repository.read_pipe_route(object.entity)
          raise ArgumentError, "missing pipe route definition for #{object.id}" unless definition

          nodes = definition.route_nodes_mm
          midpoint = path_midpoint(nodes)
          annotations = [
            annotation('pipe_size', midpoint, "Ø#{format_number(definition.diameter_mm)}"),
            annotation('pipe_system', midpoint, system_label(definition.system))
          ]

          if definition.slope_percent
            annotations << annotation(
              'slope', midpoint,
              "S=#{format_number(definition.slope_percent, 2)}%"
            )
          else
            annotations << annotation('slope_unknown', midpoint, 'S=?', status: 'verify')
          end

          if definition.start_invert_mm
            annotations << annotation('invert_start', nodes.first, "IL #{format_number(definition.start_invert_mm)}")
          end
          if definition.end_invert_mm
            annotations << annotation('invert_end', nodes.last, "IL #{format_number(definition.end_invert_mm)}")
          end

          {
            primitives: [
              {
                'type' => 'polyline',
                'role' => 'pipe_centerline',
                'points_mm' => nodes,
                'system' => definition.system,
                'diameter_mm' => definition.diameter_mm
              },
              {
                'type' => 'flow_arrow',
                'role' => 'flow_direction',
                'from_mm' => nodes[-2],
                'to_mm' => nodes[-1]
              }
            ],
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'system' => definition.system,
              'route_strategy' => definition.route_strategy,
              'length_mm' => definition.length_mm,
              'invert_known' => definition.invert_known?
            )
          }
        end

        def render_manhole(object, request)
          definition = @repository.read_manhole(object.entity)
          raise ArgumentError, "missing manhole definition for #{object.id}" unless definition

          x, y, z = definition.location_mm
          width, length = definition.size_mm
          corners = [
            [x - (width / 2.0), y - (length / 2.0), z],
            [x + (width / 2.0), y - (length / 2.0), z],
            [x + (width / 2.0), y + (length / 2.0), z],
            [x - (width / 2.0), y + (length / 2.0), z]
          ]

          annotations = [annotation('object_tag', definition.location_mm, 'MH')]
          annotations << annotation('cover_level', definition.location_mm, "CL #{format_number(definition.cover_level_mm)}") if definition.cover_level_mm
          annotations << annotation('invert_in', definition.location_mm, "IL-IN #{format_number(definition.invert_in_mm)}") if definition.invert_in_mm
          annotations << annotation('invert_out', definition.location_mm, "IL-OUT #{format_number(definition.invert_out_mm)}") if definition.invert_out_mm
          annotations << annotation('depth', definition.location_mm, "D #{format_number(definition.depth_mm)}") if definition.depth_mm

          {
            primitives: [
              {
                'type' => 'closed_polyline',
                'role' => 'manhole_outline',
                'points_mm' => corners + [corners.first]
              },
              {
                'type' => 'symbol',
                'role' => 'manhole_symbol',
                'symbol' => 'MH',
                'position_mm' => definition.location_mm
              }
            ],
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'manhole_type' => definition.manhole_type,
              'size_mm' => definition.size_mm,
              'levels_known' => !definition.cover_level_mm.nil?
            )
          }
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
            'drawing_family' => 'plumbing_drainage_plan'
          }
        end

        def path_midpoint(nodes)
          return [0.0, 0.0, 0.0] if nodes.empty?
          return nodes.first if nodes.length == 1

          a = nodes[(nodes.length - 1) / 2]
          b = nodes[nodes.length / 2]
          [
            (a[0] + b[0]) / 2.0,
            (a[1] + b[1]) / 2.0,
            (a[2] + b[2]) / 2.0
          ]
        end

        def system_label(system)
          {
            'waste' => 'WASTE',
            'soil' => 'SOIL',
            'rainwater' => 'RW'
          }.fetch(system.to_s, system.to_s.upcase)
        end

        def format_number(value, precision = 0)
          rounded = Float(value).round(precision)
          precision.zero? ? rounded.to_i.to_s : format("%.#{precision}f", rounded)
        end
      end
    end
  end
end
