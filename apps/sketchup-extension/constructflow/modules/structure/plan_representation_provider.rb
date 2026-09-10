# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Structure
      class PlanRepresentationProvider
        def initialize(repository: Repository.new)
          @repository = repository
        end

        def render(object:, request:)
          case object.type.to_s
          when 'structure.column'
            render_column(object, request)
          when 'structure.foundation'
            render_foundation(object, request)
          else
            raise ArgumentError, "unsupported structure plan representation: #{object.type}"
          end
        end

        private

        def render_column(object, request)
          definition = @repository.read_column(object.entity)
          raise ArgumentError, "missing column definition for #{object.id}" unless definition

          x, y, z = definition.location_mm
          width, depth = definition.section_mm
          corners = rectangle_points(x, y, z, width, depth)
          profile = representation_profile(request)
          annotations = [annotation('object_tag', definition.location_mm, 'C')]
          if profile != 'simple'
            annotations << annotation('section_size', definition.location_mm, "#{format_number(width)}x#{format_number(depth)}")
          end
          if profile == 'coordination'
            annotations << annotation('engineering_status', definition.location_mm, definition.engineering_status.to_s.upcase,
                                      status: engineering_annotation_status(definition.engineering_status))
          end

          {
            primitives: [
              {
                'type' => 'closed_polyline',
                'role' => 'column_outline',
                'points_mm' => corners + [corners.first],
                'style_role' => 'structure_column'
              },
              {
                'type' => 'symbol',
                'role' => 'column_symbol',
                'symbol' => 'C',
                'position_mm' => definition.location_mm
              }
            ],
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'material' => definition.material,
              'section_mm' => definition.section_mm,
              'engineering_status' => definition.engineering_status
            )
          }
        end

        def render_foundation(object, request)
          definition = @repository.read_foundation(object.entity)
          raise ArgumentError, "missing foundation definition for #{object.id}" unless definition

          x, y, z = definition.center_mm
          width, length, = definition.size_mm
          corners = rectangle_points(x, y, z, width, length)
          profile = representation_profile(request)
          annotations = [annotation('object_tag', definition.center_mm, foundation_symbol(definition.foundation_type))]
          if profile != 'simple'
            annotations << annotation('foundation_size', definition.center_mm,
                                      "#{format_number(width)}x#{format_number(length)}")
          end
          if profile == 'coordination'
            annotations << annotation('engineering_status', definition.center_mm, definition.engineering_status.to_s.upcase,
                                      status: engineering_annotation_status(definition.engineering_status))
            if definition.supported_object_id
              annotations << annotation('supported_object', definition.center_mm, "SUPPORTS #{definition.supported_object_id}")
            end
          end

          {
            primitives: [
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
                'position_mm' => definition.center_mm
              }
            ],
            annotations: annotations,
            metadata: common_metadata(request).merge(
              'representation_profile' => profile,
              'foundation_type' => definition.foundation_type,
              'size_mm' => definition.size_mm,
              'engineering_status' => definition.engineering_status,
              'supported_object_id' => definition.supported_object_id
            )
          }
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

        def engineering_annotation_status(status)
          status.to_s == 'engineer_approved' ? 'confirmed' : 'verify'
        end

        def foundation_symbol(type)
          type.to_s == 'pile_cap' ? 'PC' : 'F'
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
            'drawing_family' => 'structure_plan'
          }
        end

        def format_number(value)
          Float(value).round.to_i.to_s
        end
      end
    end
  end
end
