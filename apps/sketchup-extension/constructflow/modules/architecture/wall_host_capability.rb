# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class WallHostCapability
        CAPABILITY_ID = 'wall.host_surface'

        def initialize(repository:, geometry:)
          @repository = repository
          @geometry = geometry
        end

        def compatible_host?(smart_object)
          smart_object &&
            smart_object.type == 'architecture.wall' &&
            smart_object.owner_module == 'constructflow.architecture'
        end

        def definition(host_object)
          ensure_host!(host_object)
          @repository.read(host_object.entity) || raise(KeyError, 'wall definition missing')
        end

        def host_openings(host_object)
          ensure_host!(host_object)
          @repository.host_openings(host_object.entity)
        end

        def locate(host_object, point_mm)
          wall = definition(host_object)
          px, py, = Array(point_mm).map { |value| Float(value) }
          best = nil

          wall.path_mm.each_cons(2).with_index do |(start_point, finish_point), index|
            sx, sy = start_point[0], start_point[1]
            fx, fy = finish_point[0], finish_point[1]
            dx = fx - sx
            dy = fy - sy
            length_sq = (dx * dx) + (dy * dy)
            next if length_sq <= 0.001

            t = (((px - sx) * dx) + ((py - sy) * dy)) / length_sq
            clamped = [[t, 0.0].max, 1.0].min
            qx = sx + (dx * clamped)
            qy = sy + (dy * clamped)
            distance_sq = ((px - qx)**2) + ((py - qy)**2)
            length = Math.sqrt(length_sq)
            candidate = {
              segment_index: index,
              distance_along_mm: length * clamped,
              distance_to_host_mm: Math.sqrt(distance_sq),
              point_mm: [qx, qy, start_point[2]].freeze
            }.freeze
            best = candidate if best.nil? || candidate[:distance_to_host_mm] < best[:distance_to_host_mm]
          end

          best || raise(ArgumentError, 'wall has no valid host segment')
        end

        def validate_opening(host_object, descriptor)
          wall = definition(host_object)
          data = normalize_descriptor(descriptor)
          errors = []
          segment_index = data['segment_index']
          segment = wall.path_mm.each_cons(2).to_a[segment_index]
          return ['opening references invalid wall segment'] unless segment

          length = segment_length_mm(*segment)
          errors << 'opening start offset must be zero or greater' if data['start_offset_mm'].negative?
          errors << 'opening width must be greater than zero' unless data['width_mm'].positive?
          errors << 'opening height must be greater than zero' unless data['height_mm'].positive?
          errors << 'opening sill must be zero or greater' if data['sill_mm'].negative?
          errors << 'opening extends beyond wall segment' if (data['start_offset_mm'] + data['width_mm']) > (length + 0.001)
          errors << 'opening extends above wall height' if (data['sill_mm'] + data['height_mm']) > (wall.height_mm + 0.001)
          errors << 'hosted openings currently require a level wall segment' if (segment[1][2] - segment[0][2]).abs > 1.0

          sibling_openings = host_openings(host_object).reject do |opening|
            opening['opening_id'].to_s == data['opening_id'].to_s
          end
          if sibling_openings.any? { |opening| overlap?(data, normalize_descriptor(opening)) }
            errors << 'opening overlaps another hosted opening'
          end
          errors.freeze
        end

        def attach_opening(host_object, opening_id:, descriptor:)
          data = normalize_descriptor(descriptor).merge('opening_id' => opening_id.to_s)
          errors = validate_opening(host_object, data)
          raise ArgumentError, errors.join('; ') unless errors.empty?

          openings = host_openings(host_object)
          raise ArgumentError, "opening already attached: #{opening_id}" if openings.any? { |item| item['opening_id'] == opening_id.to_s }

          openings << data
          persist_and_rebuild(host_object, openings)
          data.freeze
        end

        def update_opening(host_object, opening_id:, descriptor:)
          data = normalize_descriptor(descriptor).merge('opening_id' => opening_id.to_s)
          errors = validate_opening(host_object, data)
          raise ArgumentError, errors.join('; ') unless errors.empty?

          openings = host_openings(host_object)
          index = openings.index { |item| item['opening_id'] == opening_id.to_s }
          raise KeyError, "hosted opening not found: #{opening_id}" unless index

          openings[index] = data
          persist_and_rebuild(host_object, openings)
          data.freeze
        end

        def detach_opening(host_object, opening_id:)
          openings = host_openings(host_object)
          retained = openings.reject { |item| item['opening_id'] == opening_id.to_s }
          return false if retained.length == openings.length

          persist_and_rebuild(host_object, retained)
          true
        end

        def opening_frame_points(host_object, descriptor)
          wall = definition(host_object)
          data = normalize_descriptor(descriptor)
          start_point, finish_point = wall.path_mm.each_cons(2).to_a.fetch(data['segment_index'])
          dx = finish_point[0] - start_point[0]
          dy = finish_point[1] - start_point[1]
          length = Math.sqrt((dx * dx) + (dy * dy))
          raise ArgumentError, 'invalid wall segment' if length <= 0.001

          ux = dx / length
          uy = dy / length
          x0 = data['start_offset_mm']
          x1 = x0 + data['width_mm']
          z0 = start_point[2] + data['sill_mm']
          z1 = z0 + data['height_mm']

          [
            [start_point[0] + (ux * x0), start_point[1] + (uy * x0), z0],
            [start_point[0] + (ux * x1), start_point[1] + (uy * x1), z0],
            [start_point[0] + (ux * x1), start_point[1] + (uy * x1), z1],
            [start_point[0] + (ux * x0), start_point[1] + (uy * x0), z1]
          ].map(&:freeze).freeze
        end

        private

        def ensure_host!(host_object)
          raise ArgumentError, 'compatible wall host required' unless compatible_host?(host_object)
        end

        def normalize_descriptor(descriptor)
          value = descriptor || {}
          {
            'opening_id' => (value['opening_id'] || value[:opening_id]).to_s,
            'segment_index' => Integer(value['segment_index'] || value[:segment_index] || 0),
            'start_offset_mm' => Float(value['start_offset_mm'] || value[:start_offset_mm] || 0),
            'width_mm' => Float(value['width_mm'] || value[:width_mm]),
            'height_mm' => Float(value['height_mm'] || value[:height_mm]),
            'sill_mm' => Float(value['sill_mm'] || value[:sill_mm] || 0)
          }
        end

        def persist_and_rebuild(host_object, openings)
          @repository.write_host_openings(host_object.entity, openings)
          @geometry.rebuild!(
            host_object.entity,
            definition(host_object),
            openings: openings
          )
          openings
        end

        def overlap?(a, b)
          return false unless a['segment_index'] == b['segment_index']

          ax0 = a['start_offset_mm']
          ax1 = ax0 + a['width_mm']
          az0 = a['sill_mm']
          az1 = az0 + a['height_mm']
          bx0 = b['start_offset_mm']
          bx1 = bx0 + b['width_mm']
          bz0 = b['sill_mm']
          bz1 = bz0 + b['height_mm']
          (ax0 < bx1) && (ax1 > bx0) && (az0 < bz1) && (az1 > bz0)
        end

        def segment_length_mm(start_point, finish_point)
          dx = finish_point[0] - start_point[0]
          dy = finish_point[1] - start_point[1]
          Math.sqrt((dx * dx) + (dy * dy))
        end
      end
    end
  end
end
