# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      class ExistingConflictScan
        SUPPORTED_TYPES = %w[
          structure.column
          structure.foundation
          drainage.manhole
          drainage.pipe_route
        ].freeze
        EPSILON = 0.001

        def initialize(runtime:)
          @runtime = runtime
          @extension_repository = Repository.new
          @structure_repository = Structure::Repository.new
          @drainage_repository = Drainage::Repository.new
        end

        def run(extension_id:)
          source = @runtime.smart_objects.fetch_by_id(extension_id.to_s)
          raise ArgumentError, 'extension zone not found' unless source && source.type == 'extension.zone'

          definition = @extension_repository.read(source.entity)
          raise ArgumentError, 'extension definition missing' unless definition

          polygon = normalize_polygon(definition.boundary_mm)
          conflicts = @runtime.smart_objects.all.filter_map do |object|
            next unless existing_remains?(object)
            next unless SUPPORTED_TYPES.include?(object.type.to_s)
            next if generated_from?(object, source.id)

            conflict_for(object, polygon)
          end.sort_by { |item| [item['domain'], item['object_type'], item['object_id']] }

          {
            'format' => 'constructflow.extension_existing_conflict_scan.v1',
            'extension_id' => source.id,
            'status' => conflicts.empty? ? 'clear' : 'conflict',
            'conflict_count' => conflicts.length,
            'conflicts' => conflicts.freeze
          }.freeze
        end

        private

        def existing_remains?(object)
          object.respond_to?(:created_phase) &&
            object.created_phase.to_s == Core::Phase::EXISTING &&
            object.respond_to?(:removed_phase) && object.removed_phase.nil?
        end

        def generated_from?(object, extension_id)
          return false unless object.respond_to?(:relationships)

          Array(object.relationships).any? do |relationship|
            (relationship['kind'] || relationship[:kind]).to_s == 'generated_from' &&
              (relationship['target_id'] || relationship[:target_id]).to_s == extension_id.to_s
          end
        end

        def conflict_for(object, polygon)
          case object.type.to_s
          when 'structure.column'
            definition = @structure_repository.read_column(object.entity)
            return missing_definition_conflict(object) unless definition
            bbox_conflict(object, polygon, definition.bounding_box_mm, 'existing_column')
          when 'structure.foundation'
            definition = @structure_repository.read_foundation(object.entity)
            return missing_definition_conflict(object) unless definition
            bbox_conflict(object, polygon, definition.bounding_box_mm, 'existing_foundation')
          when 'drainage.manhole'
            definition = @drainage_repository.read_manhole(object.entity)
            return missing_definition_conflict(object) unless definition
            bbox = manhole_bbox(definition)
            bbox_conflict(object, polygon, bbox, 'existing_manhole')
          when 'drainage.pipe_route'
            definition = @drainage_repository.read_pipe_route(object.entity)
            return missing_definition_conflict(object) unless definition
            return nil unless polyline_intersects_polygon?(definition.route_nodes_mm, polygon)

            conflict_record(
              object,
              'existing_pipe_route',
              {
                'route_node_count' => definition.route_nodes_mm.length,
                'system' => definition.system.to_s
              }
            )
          end
        rescue StandardError => error
          conflict_record(
            object,
            'scan_failed',
            { 'error' => error.message.to_s },
            rule_id: 'extension.existing_conflict.scan_failed',
            message: "existing #{object.type} could not be checked against extension footprint: #{error.message}"
          )
        end

        def bbox_conflict(object, polygon, bbox, kind)
          return nil unless bbox_intersects_polygon?(bbox, polygon)

          conflict_record(
            object,
            kind,
            {
              'bbox_min_mm' => Array(bbox[:min] || bbox['min']).map { |value| Float(value) },
              'bbox_max_mm' => Array(bbox[:max] || bbox['max']).map { |value| Float(value) }
            }
          )
        end

        def missing_definition_conflict(object)
          conflict_record(
            object,
            'definition_missing',
            {},
            rule_id: 'extension.existing_conflict.definition_missing',
            message: "existing #{object.type} has no readable semantic definition; footprint conflict cannot be verified"
          )
        end

        def conflict_record(object, kind, evidence, rule_id: nil, message: nil)
          domain = object.owner_module.to_s.sub(/^constructflow\./, '')
          {
            'rule_id' => (rule_id || "extension.existing_conflict.#{kind}").to_s,
            'state' => 'unresolved',
            'domain' => domain,
            'object_id' => object.id.to_s,
            'object_type' => object.type.to_s,
            'conflict_kind' => kind.to_s,
            'message' => message || "existing #{object.type} overlaps the Extension footprint and remains active in Proposed state",
            'evidence' => evidence.freeze
          }.freeze
        end

        def manhole_bbox(definition)
          half_x = definition.size_mm[0] / 2.0
          half_y = definition.size_mm[1] / 2.0
          x, y, z = definition.location_mm
          {
            min: [x - half_x, y - half_y, z],
            max: [x + half_x, y + half_y, z]
          }
        end

        def normalize_polygon(values)
          points = Array(values).map { |point| [Float(point[0]), Float(point[1])] }
          points.pop if points.length > 1 && same_point?(points.first, points.last)
          raise ArgumentError, 'extension footprint requires at least three unique points' if points.length < 3
          points.freeze
        end

        def bbox_intersects_polygon?(bbox, polygon)
          min = bbox[:min] || bbox['min']
          max = bbox[:max] || bbox['max']
          min_x = Float(min[0]); min_y = Float(min[1])
          max_x = Float(max[0]); max_y = Float(max[1])
          corners = [
            [min_x, min_y], [max_x, min_y], [max_x, max_y], [min_x, max_y]
          ]

          return true if corners.any? { |point| point_in_polygon?(point, polygon) }
          return true if polygon.any? { |point| point_in_box?(point, min_x, min_y, max_x, max_y) }

          box_edges = corners.each_with_index.map { |point, index| [point, corners[(index + 1) % corners.length]] }
          polygon_edges(polygon).any? do |edge|
            box_edges.any? { |box_edge| segments_intersect?(edge[0], edge[1], box_edge[0], box_edge[1]) }
          end
        end

        def polyline_intersects_polygon?(nodes, polygon)
          points = Array(nodes).map { |point| [Float(point[0]), Float(point[1])] }
          return false if points.empty?
          return true if points.any? { |point| point_in_polygon?(point, polygon) }

          edges = polygon_edges(polygon)
          points.each_cons(2).any? do |a, b|
            edges.any? { |edge| segments_intersect?(a, b, edge[0], edge[1]) }
          end
        end

        def polygon_edges(polygon)
          polygon.each_with_index.map { |point, index| [point, polygon[(index + 1) % polygon.length]] }
        end

        def point_in_box?(point, min_x, min_y, max_x, max_y)
          x, y = point
          x >= min_x - EPSILON && x <= max_x + EPSILON &&
            y >= min_y - EPSILON && y <= max_y + EPSILON
        end

        def point_in_polygon?(point, polygon)
          return true if polygon_edges(polygon).any? { |edge| point_on_segment?(point, edge[0], edge[1]) }

          x, y = point
          inside = false
          j = polygon.length - 1
          polygon.each_with_index do |current, i|
            xi, yi = current
            xj, yj = polygon[j]
            crosses = ((yi > y) != (yj > y)) &&
                      (x < ((xj - xi) * (y - yi) / ((yj - yi).abs < EPSILON ? EPSILON : (yj - yi))) + xi)
            inside = !inside if crosses
            j = i
          end
          inside
        end

        def segments_intersect?(a, b, c, d)
          return true if point_on_segment?(a, c, d) || point_on_segment?(b, c, d) ||
                         point_on_segment?(c, a, b) || point_on_segment?(d, a, b)

          ab_c = cross(a, b, c)
          ab_d = cross(a, b, d)
          cd_a = cross(c, d, a)
          cd_b = cross(c, d, b)
          ((ab_c > EPSILON && ab_d < -EPSILON) || (ab_c < -EPSILON && ab_d > EPSILON)) &&
            ((cd_a > EPSILON && cd_b < -EPSILON) || (cd_a < -EPSILON && cd_b > EPSILON))
        end

        def point_on_segment?(point, a, b)
          return false if cross(a, b, point).abs > EPSILON

          x, y = point
          min_x, max_x = [a[0], b[0]].minmax
          min_y, max_y = [a[1], b[1]].minmax
          x >= min_x - EPSILON && x <= max_x + EPSILON &&
            y >= min_y - EPSILON && y <= max_y + EPSILON
        end

        def cross(a, b, c)
          ((b[0] - a[0]) * (c[1] - a[1])) - ((b[1] - a[1]) * (c[0] - a[0]))
        end

        def same_point?(a, b)
          (a[0] - b[0]).abs <= EPSILON && (a[1] - b[1]).abs <= EPSILON
        end
      end
    end
  end
end
