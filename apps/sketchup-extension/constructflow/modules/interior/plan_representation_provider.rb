# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      class PlanRepresentationProvider
        def initialize(repository: Repository.new)
          @repository = repository
        end

        def render(object:, request:)
          raise ArgumentError, "unsupported interior plan representation: #{object.type}" unless object.type.to_s == 'interior.cabinet_run'
          definition = @repository.read_cabinet_run(object.entity)
          raise ArgumentError, "missing cabinet run definition for #{object.id}" unless definition

          profile = representation_profile(request)
          footprint = local_loop_to_world(
            [[0, 0, 0], [definition.width_mm, 0, 0], [definition.width_mm, definition.depth_mm, 0], [0, definition.depth_mm, 0]],
            definition
          )
          front_start = local_to_world([0, 0, 0], definition)
          front_end = local_to_world([definition.width_mm, 0, 0], definition)
          primitives = [
            {
              'type' => 'closed_polyline',
              'role' => 'cabinet_footprint',
              'points_mm' => footprint + [footprint.first],
              'style_role' => 'interior_cabinet'
            },
            {
              'type' => 'polyline',
              'role' => 'cabinet_front_line',
              'points_mm' => [front_start, front_end],
              'style_role' => 'interior_front'
            }
          ]

          if profile != 'simple'
            definition.module_offsets_mm[0...-1].each do |record|
              point_a = local_to_world([record['end_mm'], 0, 0], definition)
              point_b = local_to_world([record['end_mm'], [definition.depth_mm * 0.25, 100.0].min, 0], definition)
              primitives << {
                'type' => 'polyline',
                'role' => 'cabinet_module_divider',
                'points_mm' => [point_a, point_b],
                'style_role' => 'interior_module'
              }
            end
          end

          center = local_to_world([definition.width_mm / 2.0, definition.depth_mm / 2.0, 0], definition)
          annotations = [annotation('cabinet_tag', center, 'CAB')]
          if profile != 'simple'
            annotations << annotation('cabinet_size', center, "#{format_number(definition.width_mm)}x#{format_number(definition.depth_mm)}")
            annotations << annotation('cabinet_mode', center, definition.mode.to_s.upcase)
          end
          if profile == 'coordination'
            annotations << annotation('cabinet_height', center, "H #{format_number(definition.height_mm)}")
            annotations << annotation('material', center, definition.carcass_material_id)
            annotations << annotation('host_object', center, "HOST #{definition.host_object_id}") if definition.host_object_id && !definition.host_object_id.empty?
          end

          {
            primitives: primitives,
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'width_mm' => definition.width_mm,
              'height_mm' => definition.height_mm,
              'depth_mm' => definition.depth_mm,
              'angle_deg' => definition.angle_deg,
              'module_count' => definition.modules.length,
              'mode' => definition.mode,
              'host_object_id' => definition.host_object_id
            )
          }
        end

        private

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
            'drawing_family' => 'interior_joinery_plan'
          }
        end

        def local_loop_to_world(points, definition)
          points.map { |point| local_to_world(point, definition) }
        end

        def local_to_world(local, definition)
          radians = definition.angle_deg * Math::PI / 180.0
          cos = Math.cos(radians)
          sin = Math.sin(radians)
          x = Float(local[0])
          y = Float(local[1])
          [
            definition.origin_mm[0] + (x * cos) - (y * sin),
            definition.origin_mm[1] + (x * sin) + (y * cos),
            definition.origin_mm[2] + Float(local[2])
          ]
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
