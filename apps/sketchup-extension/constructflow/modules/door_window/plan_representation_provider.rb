# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      class PlanRepresentationProvider
        ARC_SEGMENTS = 8

        def initialize(runtime:, repository: InstanceRepository.new,
                       opening_repository: Opening::OpeningRepository.new,
                       wall_repository: Architecture::WallRepository.new)
          @runtime = runtime
          @repository = repository
          @opening_repository = opening_repository
          @wall_repository = wall_repository
        end

        def render(object:, request:)
          raise ArgumentError, "unsupported door/window plan representation: #{object.type}" unless object.type.to_s == 'door_window.instance'
          instance = @repository.read(object.entity)
          raise ArgumentError, "missing door/window instance definition for #{object.id}" unless instance
          type = TypeRegistry.new(@runtime.active_model).fetch(instance.type_id)
          opening = @runtime.smart_objects.fetch_by_id(instance.opening_object_id)
          raise ArgumentError, "missing opening host #{instance.opening_object_id}" unless opening
          opening_definition = @opening_repository.read(opening.entity)
          raise ArgumentError, "missing opening definition #{instance.opening_object_id}" unless opening_definition
          wall = @runtime.smart_objects.fetch_by_id(opening_definition.host_object_id)
          raise ArgumentError, "missing wall host #{opening_definition.host_object_id}" unless wall
          wall_definition = @wall_repository.read(wall.entity)
          raise ArgumentError, "missing wall definition #{opening_definition.host_object_id}" unless wall_definition

          geometry = opening_geometry(opening_definition, wall_definition)
          profile = representation_profile(request)
          primitives = [
            {
              'type' => 'polyline', 'role' => 'door_window_opening_span',
              'points_mm' => [geometry[:a], geometry[:b]], 'style_role' => 'door_window_frame'
            }
          ]
          primitives.concat(operation_primitives(type, instance, geometry)) if profile != 'simple'

          mark = instance.schedule_mark.to_s.empty? ? type.id : instance.schedule_mark
          annotations = [annotation('schedule_mark', geometry[:center], mark)]
          if profile != 'simple'
            annotations << annotation('type_name', geometry[:center], type.name)
            annotations << annotation('size', geometry[:center], "#{format_number(type.width_mm)}x#{format_number(type.height_mm)}")
            annotations << annotation('operation', geometry[:center], type.operation.to_s.upcase)
          end
          if profile == 'coordination'
            annotations << annotation('opening_host', geometry[:center], "OPENING #{instance.opening_object_id}")
            annotations << annotation('frame_material', geometry[:center], type.frame_material.to_s.upcase)
            annotations << annotation('handing', geometry[:center], instance.handing.to_s.upcase)
          end

          {
            primitives: primitives,
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'category' => type.category,
              'operation' => type.operation,
              'type_id' => type.id,
              'opening_object_id' => instance.opening_object_id,
              'handing' => instance.handing,
              'schedule_mark' => instance.schedule_mark,
              'frame_material' => type.frame_material
            )
          }
        end

        private

        def opening_geometry(opening, wall)
          path = wall.respond_to?(:centerline_path_mm) ? wall.centerline_path_mm : wall.path_mm
          start_point, finish_point = path.each_cons(2).to_a.fetch(opening.segment_index)
          dx = finish_point[0] - start_point[0]
          dy = finish_point[1] - start_point[1]
          length = Math.sqrt((dx * dx) + (dy * dy))
          raise ArgumentError, 'invalid door/window wall segment' if length <= 0.001
          ux = dx / length
          uy = dy / length
          nx = -uy
          ny = ux
          z = start_point[2] + wall.base_offset_mm
          x0 = opening.start_offset_mm
          x1 = x0 + opening.width_mm
          a = [start_point[0] + (ux * x0), start_point[1] + (uy * x0), z]
          b = [start_point[0] + (ux * x1), start_point[1] + (uy * x1), z]
          { a: a, b: b, center: midpoint(a, b), tangent: [ux, uy], normal: [nx, ny], width: opening.width_mm }
        end

        def operation_primitives(type, instance, geometry)
          case type.operation.to_s
          when 'swing'
            swing_primitives(instance, geometry)
          when 'sliding'
            sliding_primitives(geometry)
          else
            [{ 'type' => 'symbol', 'role' => 'fixed_panel', 'symbol' => 'FIX', 'position_mm' => geometry[:center], 'style_role' => 'door_window_operation' }]
          end
        end

        def swing_primitives(instance, geometry)
          left_hinge = instance.handing.to_s.downcase.include?('left')
          hinge = left_hinge ? geometry[:a] : geometry[:b]
          tangent_sign = left_hinge ? 1.0 : -1.0
          closed_vector = [geometry[:tangent][0] * geometry[:width] * tangent_sign,
                           geometry[:tangent][1] * geometry[:width] * tangent_sign]
          open_vector = [geometry[:normal][0] * geometry[:width], geometry[:normal][1] * geometry[:width]]
          leaf_end = [hinge[0] + open_vector[0], hinge[1] + open_vector[1], hinge[2]]
          arc = (0..ARC_SEGMENTS).map do |index|
            t = (Math::PI / 2.0) * index / ARC_SEGMENTS
            x = (closed_vector[0] * Math.cos(t)) + (open_vector[0] * Math.sin(t))
            y = (closed_vector[1] * Math.cos(t)) + (open_vector[1] * Math.sin(t))
            [hinge[0] + x, hinge[1] + y, hinge[2]]
          end
          [
            { 'type' => 'polyline', 'role' => 'swing_leaf', 'points_mm' => [hinge, leaf_end], 'style_role' => 'door_window_operation' },
            { 'type' => 'polyline', 'role' => 'swing_arc', 'points_mm' => arc, 'style_role' => 'door_window_operation' }
          ]
        end

        def sliding_primitives(geometry)
          quarter = geometry[:width] * 0.25
          from = [geometry[:center][0] - (geometry[:tangent][0] * quarter), geometry[:center][1] - (geometry[:tangent][1] * quarter), geometry[:center][2]]
          to = [geometry[:center][0] + (geometry[:tangent][0] * quarter), geometry[:center][1] + (geometry[:tangent][1] * quarter), geometry[:center][2]]
          [{ 'type' => 'flow_arrow', 'role' => 'sliding_direction', 'from_mm' => from, 'to_mm' => to, 'style_role' => 'door_window_operation' }]
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

        def midpoint(a, b)
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
