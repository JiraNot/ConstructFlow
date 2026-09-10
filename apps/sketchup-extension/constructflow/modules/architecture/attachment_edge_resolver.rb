# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class AttachmentEdgeResolver
        LINE_TOLERANCE_MM = 5.0
        MIN_OVERLAP_MM = 25.0
        PARALLEL_TOLERANCE = 1.0e-6

        Result = Struct.new(:host_object_id, :edge_index, :overlap_mm, :resolution, keyword_init: true) do
          def to_h
            {
              'host_object_id' => host_object_id.to_s,
              'edge_index' => Integer(edge_index),
              'overlap_mm' => Float(overlap_mm),
              'resolution' => resolution.to_s
            }.freeze
          end
        end

        def initialize(repository: WallRepository.new,
                       line_tolerance_mm: LINE_TOLERANCE_MM,
                       min_overlap_mm: MIN_OVERLAP_MM)
          @repository = repository
          @line_tolerance_mm = Float(line_tolerance_mm)
          @min_overlap_mm = Float(min_overlap_mm)
        end

        def resolve(runtime:, boundary_mm:, attachment_host_id:, explicit_edge_index: nil, source_extension_id: nil)
          host_id = attachment_host_id.to_s.strip
          return nil if host_id.empty?

          host = runtime.smart_objects.fetch_by_id(host_id)
          raise ArgumentError, "attachment host #{host_id} not found" unless host
          unless host.type.to_s == 'architecture.wall' && host.owner_module.to_s == 'constructflow.architecture'
            raise ArgumentError, "attachment host #{host_id} must be an Architecture Smart Wall"
          end
          if generated_from_source_extension?(host, source_extension_id)
            raise ArgumentError, "attachment host #{host_id} cannot be a wall generated from the same Extension"
          end

          host_definition = @repository.read(host.entity)
          raise ArgumentError, "attachment host #{host_id} has no WallDefinition" unless host_definition

          edges = boundary_edges(boundary_mm)
          raise ArgumentError, 'extension boundary requires at least three edges' if edges.length < 3

          unless explicit_edge_index.nil?
            index = Integer(explicit_edge_index)
            raise ArgumentError, "attachment_edge_index #{index} is outside extension boundary" unless index.between?(0, edges.length - 1)

            overlap = overlap_with_host(edges[index], host_definition.path_mm)
            if overlap < @min_overlap_mm
              raise ArgumentError,
                    "attachment_edge_index #{index} does not overlap attachment host #{host_id}"
            end
            return Result.new(
              host_object_id: host.id,
              edge_index: index,
              overlap_mm: overlap,
              resolution: 'explicit'
            ).freeze
          end

          candidates = edges.each_with_index.filter_map do |edge, index|
            overlap = overlap_with_host(edge, host_definition.path_mm)
            next if overlap < @min_overlap_mm
            [index, overlap]
          end
          raise ArgumentError, "attachment host #{host_id} does not overlap any extension boundary edge" if candidates.empty?

          if candidates.length != 1
            indexes = candidates.map(&:first).join(', ')
            raise ArgumentError,
                  "attachment host #{host_id} matches multiple extension edges (#{indexes}); set architecture.attachment_edge_index explicitly"
          end

          index, overlap = candidates.first
          Result.new(
            host_object_id: host.id,
            edge_index: index,
            overlap_mm: overlap,
            resolution: 'geometry_match'
          ).freeze
        end

        private

        def generated_from_source_extension?(host, extension_id)
          source_id = extension_id.to_s.strip
          return false if source_id.empty? || !host.respond_to?(:relationships)

          Array(host.relationships).any? do |relationship|
            (relationship['kind'] || relationship[:kind]).to_s == 'generated_from' &&
              (relationship['target_id'] || relationship[:target_id]).to_s == source_id
          end
        end

        def boundary_edges(boundary_mm)
          points = Array(boundary_mm)
          points.each_with_index.map do |point, index|
            [point, points[(index + 1) % points.length]]
          end
        end

        def overlap_with_host(edge, host_path)
          Array(host_path).each_cons(2).map do |host_segment|
            collinear_overlap_mm(edge, host_segment)
          end.max || 0.0
        end

        def collinear_overlap_mm(first_segment, second_segment)
          a, b = first_segment
          c, d = second_segment
          ax = Float(a[0]); ay = Float(a[1])
          bx = Float(b[0]); by = Float(b[1])
          cx = Float(c[0]); cy = Float(c[1])
          dx = Float(d[0]); dy = Float(d[1])

          vx = bx - ax
          vy = by - ay
          wx = dx - cx
          wy = dy - cy
          v_length = Math.sqrt((vx * vx) + (vy * vy))
          w_length = Math.sqrt((wx * wx) + (wy * wy))
          return 0.0 if v_length <= 0.001 || w_length <= 0.001

          cross = (vx * wy) - (vy * wx)
          return 0.0 if cross.abs > (v_length * w_length * PARALLEL_TOLERANCE)

          line_distance = (((cx - ax) * vy) - ((cy - ay) * vx)).abs / v_length
          return 0.0 if line_distance > @line_tolerance_mm

          ux = vx / v_length
          uy = vy / v_length
          c_projection = ((cx - ax) * ux) + ((cy - ay) * uy)
          d_projection = ((dx - ax) * ux) + ((dy - ay) * uy)
          other_min, other_max = [c_projection, d_projection].minmax
          overlap_start = [0.0, other_min].max
          overlap_finish = [v_length, other_max].min
          [overlap_finish - overlap_start, 0.0].max
        end
      end
    end
  end
end
