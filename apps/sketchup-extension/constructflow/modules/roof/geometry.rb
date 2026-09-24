# frozen_string_literal: true

require_relative '../../core/model_materials'

module JiraNot
  module ConstructFlow
    module Roof
      class Geometry
        EAVE_OVERHANG_MM = 300.0
        FASCIA_HEIGHT_MM = 120.0

        def create_roof_group(model, definition)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Roof'
          rebuild_roof!(group, definition)
          group
        end

        def rebuild_roof!(group, definition)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          entities = group.entities
          entities.clear!
          model = group_model(group)
          material = covering_material(definition.covering_system)
          thickness_mm = Float(definition.respond_to?(:thickness_mm) ? definition.thickness_mm : 20.0)

          extended, eave_edges = extended_facets_with_eaves(definition)
          faces = extended.map do |facet|
            face = entities.add_face(facet.map { |value| point(value) })
            raise 'failed to create roof face' unless face

            face.reverse! if face.normal.z < 0
            face.pushpull(-Core::Units.mm_to_su(thickness_mm))
            Core::ModelMaterials.paint(model, face, material)
            face
          end
          raise 'failed to create roof faces' if faces.empty?

          eave_edges.each { |a_mm, b_mm| add_fascia_board(entities, model, a_mm, b_mm) }
          group
        end

        def create_gutter_group(model, roof_object:, definition:, edge_capability:)
          group = model.active_entities.add_group
          group.name = 'ConstructFlow Gutter'
          rebuild_gutter!(group, roof_object: roof_object, definition: definition, edge_capability: edge_capability)
          group
        end

        def rebuild_gutter!(group, roof_object:, definition:, edge_capability:)
          entities = group.entities
          entities.clear!
          a, b = edge_capability.edge_points_mm(roof_object, definition.edge_index)
          entities.add_line(point(a), point(b))
          group
        end

        private

        # Extends every eave vertex outward by EAVE_OVERHANG_MM. Each vertex
        # receives exactly ONE displacement vector (edge normal, or the
        # bisector when two eave edges meet at a corner), so facets that share
        # a vertex stay watertight. Definition-level facets and quantities are
        # untouched — this is presentation-only.
        def extended_facets_with_eaves(definition)
          facets = definition.facets_mm.map { |facet| facet.map { |value| value.dup } }
          return [facets, []] if definition.slope_percent <= 0.0

          eave_normals = eave_vertex_normals(facets)
          return [facets, []] if eave_normals.empty?

          gradient = definition.slope_percent / 100.0
          direction = definition.slope_direction_xy
          displacement = {}
          eave_normals.each do |key, normals|
            sum_x = normals.sum { |normal| normal[0] }
            sum_y = normals.sum { |normal| normal[1] }
            length = Math.sqrt((sum_x * sum_x) + (sum_y * sum_y))
            next if length <= 0.001

            nx = sum_x / length
            ny = sum_y / length
            drop = gradient * ((nx * direction[0]) + (ny * direction[1])) * EAVE_OVERHANG_MM
            displacement[key] = [EAVE_OVERHANG_MM * nx, EAVE_OVERHANG_MM * ny, -drop]
          end

          extended = facets.map do |facet|
            facet.map do |value|
              delta = displacement[vertex_key(value)]
              delta ? [value[0] + delta[0], value[1] + delta[1], value[2] + delta[2]] : value
            end
          end
          eave_edges = eave_edge_list(facets).map do |a_mm, b_mm|
            [moved(a_mm, displacement), moved(b_mm, displacement)]
          end
          [extended, eave_edges]
        end

        # Outward plan normals for every eave vertex, keyed by coordinates.
        def eave_vertex_normals(facets)
          z_lowest = facets.flatten(1).map { |value| value[2] }.min
          normals = Hash.new { |hash, key| hash[key] = [] }
          facets.each do |facet|
            centroid_x = facet.sum { |value| value[0] } / facet.length
            centroid_y = facet.sum { |value| value[1] } / facet.length
            facet.each_with_index do |value, index|
              nxt = facet[(index + 1) % facet.length]
              next unless eave_edge?(value, nxt, z_lowest)

            normal_x, normal_y = outward_normal(value, nxt, centroid_x, centroid_y)
            normals[vertex_key(value)] << [normal_x, normal_y]
            normals[vertex_key(nxt)] << [normal_x, normal_y]
            end
          end
          normals
        end

        def eave_edge_list(facets)
          z_lowest = facets.flatten(1).map { |value| value[2] }.min
          edges = []
          facets.each do |facet|
            facet.each_with_index do |value, index|
              nxt = facet[(index + 1) % facet.length]
              edges << [value.dup, nxt.dup] if eave_edge?(value, nxt, z_lowest)
            end
          end
          edges
        end

        def eave_edge?(first_pt, second_pt, z_lowest)
          (first_pt[2] - z_lowest).abs <= 0.001 && (second_pt[2] - z_lowest).abs <= 0.001
        end

        def vertex_key(value)
          [value[0].round(3), value[1].round(3), value[2].round(3)]
        end

        def moved(value, displacement)
          delta = displacement[vertex_key(value)]
          delta ? [value[0] + delta[0], value[1] + delta[1], value[2] + delta[2]] : value.dup
        end

        def outward_normal(first_pt, second_pt, centroid_x, centroid_y)
          delta_x = second_pt[0] - first_pt[0]
          delta_y = second_pt[1] - first_pt[1]
          length = Math.sqrt((delta_x * delta_x) + (delta_y * delta_y))
          return [0.0, 1.0] if length <= 0.001

          normal_x = -delta_y / length
          normal_y = delta_x / length
          mid_x = ((first_pt[0] + second_pt[0]) / 2.0) - centroid_x
          mid_y = ((first_pt[1] + second_pt[1]) / 2.0) - centroid_y
          # The outward side is the one whose normal points AWAY from the
          # facet centroid (positive dot with the centroid->midpoint vector).
          if ((normal_x * mid_x) + (normal_y * mid_y)).positive?
            [normal_x, normal_y]
          else
            [-normal_x, -normal_y]
          end
        end

        # Fascia board along each extended eave edge, hanging below the sheet.
        def add_fascia_board(entities, model, start_mm, finish_mm)
          delta_x = finish_mm[0] - start_mm[0]
          delta_y = finish_mm[1] - start_mm[1]
          length = Math.sqrt((delta_x * delta_x) + (delta_y * delta_y))
          return if length <= 0.001

          normal_x = -delta_y / length
          normal_y = delta_x / length
          sheet_t = Core::Units.mm_to_su(20.0)
          board_h = Core::Units.mm_to_su(FASCIA_HEIGHT_MM)
          start_pt = point(start_mm)
          finish_pt = point(finish_mm)
          face = entities.add_face(
            Geom::Point3d.new(start_pt.x, start_pt.y, start_pt.z),
            Geom::Point3d.new(finish_pt.x, finish_pt.y, finish_pt.z),
            Geom::Point3d.new(finish_pt.x, finish_pt.y, finish_pt.z - board_h),
            Geom::Point3d.new(start_pt.x, start_pt.y, start_pt.z - board_h)
          )
          return unless face

          face.reverse! if face.normal.z.positive?
          face.pushpull(Geom::Vector3d.new(normal_x * sheet_t, normal_y * sheet_t, 0))
          Core::ModelMaterials.paint(model, face, 'CF Timber')
        end

        def covering_material(covering_system)
          case covering_system.to_s
          when /tile/ then 'CF Roof Tile'
          else 'CF Roof Metal Sheet'
          end
        end

        def group_model(group)
          return nil unless group.respond_to?(:model)

          model = group.model
          model.respond_to?(:materials) ? model : nil
        rescue StandardError
          nil
        end

        def point(values_mm)
          x, y, z = Core::Units.point_from_mm(values_mm)
          Geom::Point3d.new(x, y, z)
        end
      end
    end
  end
end
