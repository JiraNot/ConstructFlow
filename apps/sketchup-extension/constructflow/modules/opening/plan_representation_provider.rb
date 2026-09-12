# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Opening
      class PlanRepresentationProvider
        def initialize(runtime:, repository: OpeningRepository.new, wall_repository: Architecture::WallRepository.new)
          @runtime = runtime
          @repository = repository
          @wall_repository = wall_repository
        end

        def render(object:, request:)
          raise ArgumentError, "unsupported opening plan representation: #{object.type}" unless object.type.to_s == 'opening.rectangular'
          definition = @repository.read(object.entity)
          raise ArgumentError, "missing opening definition for #{object.id}" unless definition
          wall = @runtime.smart_objects.fetch_by_id(definition.host_object_id)
          raise ArgumentError, "missing opening wall host #{definition.host_object_id}" unless wall
          wall_definition = @wall_repository.read(wall.entity)
          raise ArgumentError, "missing wall definition for opening host #{definition.host_object_id}" unless wall_definition

          profile = representation_profile(request)
          lifecycle_role = demolition_cut?(object, request) ? 'demolition' : nil
          jamb_a, jamb_b, center = opening_plan_points(definition, wall_definition)
          primitives = [
            primitive(
              'polyline', 'opening_span',
              { 'points_mm' => [jamb_a, jamb_b], 'style_role' => 'opening_void' },
              lifecycle_role
            ),
            primitive(
              'symbol', 'opening_symbol',
              { 'symbol' => 'OP', 'position_mm' => center, 'style_role' => 'opening_void' },
              lifecycle_role
            )
          ]
          annotations = [annotation('opening_tag', center, 'OP', lifecycle_role: lifecycle_role)]
          if profile != 'simple'
            annotations << annotation('opening_width', center, "W #{format_number(definition.width_mm)}", lifecycle_role: lifecycle_role)
            annotations << annotation('opening_height', center, "H #{format_number(definition.height_mm)}", lifecycle_role: lifecycle_role)
          end
          if profile == 'coordination'
            annotations << annotation('host_wall', center, "WALL #{definition.host_object_id}")
            annotations << annotation('sill', center, "SILL #{format_number(definition.sill_mm)}")
            infill = @repository.infill_ref(object.entity)
            annotations << annotation('infill', center, "INFILL #{infill['infill_type']}") if infill && !infill['infill_type'].to_s.empty?
          end

          {
            primitives: primitives,
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'host_object_id' => definition.host_object_id,
              'segment_index' => definition.segment_index,
              'start_offset_mm' => definition.start_offset_mm,
              'width_mm' => definition.width_mm,
              'height_mm' => definition.height_mm,
              'sill_mm' => definition.sill_mm,
              'demolition_cut' => lifecycle_role == 'demolition'
            )
          }
        end

        private

        def primitive(type, role, payload, lifecycle_role)
          value = { 'type' => type, 'role' => role }.merge(payload)
          value['lifecycle_role'] = lifecycle_role if lifecycle_role
          value
        end

        def demolition_cut?(object, request)
          return false unless request['phase_view'].to_s == 'demolition'

          Array(object.relationships).any? do |relationship|
            (relationship['role'] || relationship[:role]).to_s == 'modifies_existing_host'
          end
        end

        def opening_plan_points(definition, wall)
          path = wall.respond_to?(:centerline_path_mm) ? wall.centerline_path_mm : wall.path_mm
          segment = path.each_cons(2).to_a.fetch(definition.segment_index)
          start_point, finish_point = segment
          dx = finish_point[0] - start_point[0]
          dy = finish_point[1] - start_point[1]
          length = Math.sqrt((dx * dx) + (dy * dy))
          raise ArgumentError, 'invalid opening wall segment' if length <= 0.001
          ux = dx / length
          uy = dy / length
          z = start_point[2] + wall.base_offset_mm
          a_offset = definition.start_offset_mm
          b_offset = definition.start_offset_mm + definition.width_mm
          a = [start_point[0] + (ux * a_offset), start_point[1] + (uy * a_offset), z]
          b = [start_point[0] + (ux * b_offset), start_point[1] + (uy * b_offset), z]
          center = [(a[0] + b[0]) / 2.0, (a[1] + b[1]) / 2.0, z]
          [a, b, center]
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

        def annotation(role, anchor_mm, text, status: 'confirmed', lifecycle_role: nil)
          value = { 'type' => 'text', 'role' => role, 'anchor_mm' => anchor_mm, 'text' => text.to_s, 'status' => status }
          value['lifecycle_role'] = lifecycle_role if lifecycle_role
          value
        end

        def format_number(value)
          rounded = Float(value).round(2)
          rounded == rounded.to_i ? rounded.to_i.to_s : rounded.to_s
        end
      end
    end
  end
end
