# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Surface
      class PlanRepresentationProvider
        def initialize(runtime:, repository: Repository.new)
          @runtime = runtime
          @repository = repository
        end

        def render(object:, request:)
          case object.type.to_s
          when 'surface.boundary'
            render_surface(object, request)
          when 'surface.pattern'
            render_pattern(object, request)
          else
            raise ArgumentError, "unsupported surface plan representation: #{object.type}"
          end
        end

        private

        def render_surface(object, request)
          definition = @repository.read_surface(object.entity)
          raise ArgumentError, "missing surface definition for #{object.id}" unless definition

          profile = representation_profile(request)
          primitives = [
            {
              'type' => 'closed_polyline',
              'role' => 'surface_boundary',
              'points_mm' => close_loop(definition.outer_boundary_mm),
              'style_role' => 'surface_boundary'
            }
          ]
          definition.holes_mm.each do |loop|
            primitives << {
              'type' => 'closed_polyline',
              'role' => 'surface_hole',
              'points_mm' => close_loop(loop),
              'style_role' => 'surface_cutout'
            }
          end

          annotations = [annotation('surface_type', definition.center_mm, definition.surface_type.to_s.upcase)]
          if profile != 'simple'
            annotations << annotation('net_area', definition.center_mm, "AREA #{format_area(definition.net_area_mm2)} m²")
            annotations << annotation('base_level', definition.center_mm, "LEVEL #{definition.base_level_id}") if definition.base_level_id && !definition.base_level_id.empty?
          end
          if profile == 'coordination'
            annotations << annotation('base_elevation', definition.center_mm, "EL #{format_number(definition.base_elevation_mm)}")
            annotations << annotation('drain_target', definition.center_mm, "DRAIN #{definition.drain_target_id}") if definition.drain_target_id && !definition.drain_target_id.empty?
          end

          {
            primitives: primitives,
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'surface_type' => definition.surface_type,
              'net_area_mm2' => definition.net_area_mm2,
              'hole_count' => definition.holes_mm.length,
              'assembly_id' => definition.assembly_id,
              'drain_target_id' => definition.drain_target_id
            )
          }
        end

        def render_pattern(object, request)
          definition = @repository.read_pattern(object.entity)
          raise ArgumentError, "missing pattern definition for #{object.id}" unless definition
          surface = @runtime.smart_objects.fetch_by_id(definition.surface_object_id)
          raise ArgumentError, "missing pattern surface host #{definition.surface_object_id}" unless surface
          surface_definition = @repository.read_surface(surface.entity)
          raise ArgumentError, "missing surface definition for pattern host #{definition.surface_object_id}" unless surface_definition

          profile = representation_profile(request)
          center = surface_definition.center_mm
          primary = definition.basis[:primary]
          direction_end = [center[0] + (primary[0] * 600.0), center[1] + (primary[1] * 600.0), center[2]]
          primitives = [
            {
              'type' => 'flow_arrow',
              'role' => 'pattern_direction',
              'from_mm' => center,
              'to_mm' => direction_end,
              'style_role' => 'surface_pattern'
            },
            {
              'type' => 'symbol',
              'role' => 'pattern_origin',
              'symbol' => 'PO',
              'position_mm' => definition.origin_mm,
              'style_role' => 'surface_pattern'
            }
          ]

          annotations = [annotation('pattern_name', center, definition.pattern.to_s.upcase)]
          if profile != 'simple'
            annotations << annotation('module_size', center, "#{format_number(definition.module_mm[0])}x#{format_number(definition.module_mm[1])}")
            annotations << annotation('joint_width', center, "J #{format_number(definition.joint_mm)}")
          end
          if profile == 'coordination'
            annotations << annotation('layout_state', center, definition.layout_state.to_s.upcase)
            annotations << annotation('surface_host', center, "SURFACE #{definition.surface_object_id}")
            annotations << annotation('minimum_cut', center, "MIN CUT #{format_number(definition.minimum_cut_mm)}")
          end

          {
            primitives: primitives,
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'pattern' => definition.pattern,
              'surface_object_id' => definition.surface_object_id,
              'module_mm' => definition.module_mm,
              'joint_mm' => definition.joint_mm,
              'layout_state' => definition.layout_state
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

        def common_metadata(request)
          {
            'view' => request['view'],
            'scale' => request['scale'],
            'phase_view' => request['phase_view'],
            'lod' => request['lod'],
            'style_preset' => request.dig('context', 'style_preset'),
            'drawing_family' => 'surface_paving_plan'
          }
        end

        def close_loop(points)
          values = Array(points)
          return values if values.empty? || values.first == values.last
          values + [values.first]
        end

        def annotation(role, anchor_mm, text, status: 'confirmed')
          { 'type' => 'text', 'role' => role, 'anchor_mm' => anchor_mm, 'text' => text.to_s, 'status' => status }
        end

        def format_number(value)
          rounded = Float(value).round(2)
          rounded == rounded.to_i ? rounded.to_i.to_s : rounded.to_s
        end

        def format_area(value_mm2)
          format('%.2f', Float(value_mm2) / 1_000_000.0)
        end
      end
    end
  end
end
