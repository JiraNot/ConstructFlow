# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      class PlanRepresentationProvider
        def initialize(runtime:, repository: Repository.new)
          @runtime = runtime
          @repository = repository
        end

        def render(object:, request:)
          case object.type.to_s
          when 'structure.grid'
            render_grid(object, request)
          when 'structure.beam'
            render_beam(object, request)
          when 'structure.column'
            render_column(object, request)
          when 'structure.foundation'
            render_foundation(object, request)
          when 'structure.rebar_set'
            render_rebar_set(object, request)
          else
            raise ArgumentError, "unsupported structure plan representation: #{object.type}"
          end
        end

        private

        def render_grid(object, request)
          definition = @repository.read_grid(object.entity)
          raise ArgumentError, "missing grid definition for #{object.id}" unless definition

          {
            primitives: [{
              'type' => 'line', 'role' => 'structural_grid', 'points_mm' => definition.path_mm,
              'style_role' => 'structure_grid'
            }],
            annotations: [annotation('grid_name', definition.path_mm.first, definition.name)],
            metadata: common_metadata(request).merge(
              'representation_profile' => representation_profile(request), 'member_kind' => 'grid',
              'grid_name' => definition.name, 'level_id' => definition.level_id
            )
          }
        end

        def render_beam(object, request)
          definition = @repository.read_beam(object.entity)
          raise ArgumentError, "missing beam definition for #{object.id}" unless definition

          {
            primitives: [{
              'type' => 'line', 'role' => 'beam_axis', 'points_mm' => definition.path_mm,
              'style_role' => 'structure_primary'
            }],
            annotations: [annotation('object_tag', definition.path_mm.first, 'B')],
            metadata: common_metadata(request).merge(
              'representation_profile' => representation_profile(request), 'member_kind' => 'beam',
              'section_mm' => definition.section_mm, 'material' => definition.material,
              'engineering_status' => definition.engineering_status
            )
          }
        end

        def render_column(object, request)
          definition = @repository.read_column(object.entity)
          raise ArgumentError, "missing column definition for #{object.id}" unless definition

          profile = representation_profile(request)
          x, y, z = definition.location_mm
          width, depth = definition.section_mm
          corners = rectangle_points(x, y, z, width, depth)
          primitives = [
            {
              'type' => 'closed_polyline',
              'role' => 'column_outline',
              'points_mm' => corners + [corners.first],
              'style_role' => 'structure_primary'
            },
            {
              'type' => 'symbol',
              'role' => 'column_symbol',
              'symbol' => 'C',
              'position_mm' => definition.location_mm,
              'style_role' => 'structure_primary'
            }
          ]
          annotations = [annotation('object_tag', definition.location_mm, 'C')]
          if profile != 'simple'
            annotations << annotation('section_size', definition.location_mm, "#{format_number(width)}x#{format_number(depth)}")
          end
          if profile == 'coordination'
            annotations << annotation('engineering_status', definition.location_mm, definition.engineering_status.to_s.upcase, status: status_for(definition.engineering_status))
            annotations << annotation('level_range', definition.location_mm, level_range(definition)) unless level_range(definition).empty?
          end

          {
            primitives: primitives,
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'member_kind' => 'column',
              'material' => definition.material,
              'section_mm' => definition.section_mm,
              'engineering_status' => definition.engineering_status
            )
          }
        end

        def render_foundation(object, request)
          definition = @repository.read_foundation(object.entity)
          raise ArgumentError, "missing foundation definition for #{object.id}" unless definition

          profile = representation_profile(request)
          x, y, z = definition.center_mm
          width, length, thickness = definition.size_mm
          corners = rectangle_points(x, y, z, width, length)
          primitives = [
            {
              'type' => 'closed_polyline',
              'role' => 'foundation_outline',
              'points_mm' => corners + [corners.first],
              'style_role' => 'structure_foundation'
            },
            {
              'type' => 'symbol',
              'role' => 'foundation_symbol',
              'symbol' => foundation_symbol(definition.foundation_type),
              'position_mm' => definition.center_mm,
              'style_role' => 'structure_foundation'
            }
          ]
          annotations = [annotation('object_tag', definition.center_mm, foundation_symbol(definition.foundation_type))]
          if profile != 'simple'
            annotations << annotation('foundation_size', definition.center_mm, "#{format_number(width)}x#{format_number(length)}x#{format_number(thickness)}")
            annotations << annotation('top_level', definition.center_mm, "TOS #{format_number(definition.top_elevation_mm)}")
          end
          if profile == 'coordination'
            annotations << annotation('engineering_status', definition.center_mm, definition.engineering_status.to_s.upcase, status: status_for(definition.engineering_status))
            if definition.supported_object_id && !definition.supported_object_id.empty?
              annotations << annotation('supported_object', definition.center_mm, "SUPPORTS #{definition.supported_object_id}")
            end
          end

          {
            primitives: primitives,
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'member_kind' => 'foundation',
              'foundation_type' => definition.foundation_type,
              'size_mm' => definition.size_mm,
              'engineering_status' => definition.engineering_status
            )
          }
        end

        def render_rebar_set(object, request)
          definition = @repository.read_rebar_set(object.entity)
          raise ArgumentError, "missing rebar definition for #{object.id}" unless definition

          host = @runtime.smart_objects.fetch_by_id(definition.host_object_id)
          raise ArgumentError, "missing rebar host #{definition.host_object_id}" unless host
          anchor = host_anchor(host)
          profile = representation_profile(request)
          label = "#{definition.bar_count}-DB#{format_number(definition.diameter_mm)}"
          annotations = [annotation('rebar_tag', anchor, label)]
          if profile != 'simple'
            annotations << annotation('rebar_role', anchor, definition.role.to_s.upcase)
            annotations << annotation('bar_grade', anchor, definition.bar_grade)
          end
          if profile == 'coordination'
            annotations << annotation('engineering_status', anchor, definition.engineering_status.to_s.upcase, status: status_for(definition.engineering_status))
            annotations << annotation('host_object', anchor, "HOST #{definition.host_object_id}")
          end

          {
            primitives: [],
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'member_kind' => 'rebar_set',
              'host_object_id' => definition.host_object_id,
              'diameter_mm' => definition.diameter_mm,
              'bar_count' => definition.bar_count,
              'engineering_status' => definition.engineering_status
            )
          }
        end

        def host_anchor(host)
          case host.type.to_s
          when 'structure.column'
            definition = @repository.read_column(host.entity)
            definition&.location_mm || [0.0, 0.0, 0.0]
          when 'structure.foundation'
            definition = @repository.read_foundation(host.entity)
            definition&.center_mm || [0.0, 0.0, 0.0]
          else
            [0.0, 0.0, 0.0]
          end
        end

        def rectangle_points(x, y, z, width, depth)
          half_x = width / 2.0
          half_y = depth / 2.0
          [
            [x - half_x, y - half_y, z],
            [x + half_x, y - half_y, z],
            [x + half_x, y + half_y, z],
            [x - half_x, y + half_y, z]
          ]
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
            'drawing_family' => 'structure_plan'
          }
        end

        def foundation_symbol(type)
          type.to_s == 'pile_cap' ? 'PC' : 'F'
        end

        def level_range(definition)
          values = [definition.base_level_id, definition.top_level_id].compact.reject(&:empty?)
          values.join(' → ')
        end

        def status_for(engineering_status)
          engineering_status.to_s == 'preliminary' ? 'verify' : 'confirmed'
        end

        def annotation(role, anchor_mm, text, status: 'confirmed')
          {
            'type' => 'text',
            'role' => role,
            'anchor_mm' => anchor_mm,
            'text' => text.to_s,
            'status' => status
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
