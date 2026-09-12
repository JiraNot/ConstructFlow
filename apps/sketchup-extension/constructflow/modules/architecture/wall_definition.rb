# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Architecture
      class WallDefinition
        SCHEMA_VERSION = 1
        DEFAULT_THICKNESS_MM = 100.0
        DEFAULT_HEIGHT_MM = 2800.0
        LOCATION_LINES = %w[center core_center finish_face_exterior finish_face_interior core_face_exterior core_face_interior].freeze
        TOP_CONSTRAINTS = %w[unconnected level].freeze
        PHASE_LIFECYCLES = %w[existing existing_to_remain existing_to_modify demolished new].freeze
        ORIENTATION_FLIPS = {
          'left' => 'right', 'right' => 'left',
          'interior' => 'exterior', 'exterior' => 'interior',
          'inside' => 'outside', 'outside' => 'inside',
          'flipped' => 'center'
        }.freeze

        attr_reader :path_mm, :thickness_mm, :height_mm, :base_offset_mm,
                    :wall_type_id, :orientation, :geometry_mode, :layers,
                    :core_layer_id, :base_level_id, :top_constraint,
                    :top_constraint_level_id, :top_offset_mm, :location_line,
                    :room_bounding, :phase_lifecycle, :joins, :constraints

        def initialize(path_mm:, thickness_mm: DEFAULT_THICKNESS_MM, height_mm: DEFAULT_HEIGHT_MM,
                       base_offset_mm: 0, wall_type_id: 'generic.wall.100',
                       orientation: 'center', geometry_mode: 'parametric', layers: [],
                       core_layer_id: nil, base_level_id: nil, top_constraint: 'unconnected',
                       top_constraint_level_id: nil, top_offset_mm: 0, location_line: 'center',
                       room_bounding: true, phase_lifecycle: 'new', joins: [], constraints: [])
          @path_mm = normalize_path(path_mm).freeze
          @thickness_mm = Float(thickness_mm)
          @height_mm = Float(height_mm)
          @base_offset_mm = Float(base_offset_mm)
          @wall_type_id = wall_type_id.to_s
          @orientation = orientation.to_s
          @geometry_mode = geometry_mode.to_s
          @layers = normalize_layers(layers).freeze
          @core_layer_id = core_layer_id&.to_s
          @base_level_id = base_level_id&.to_s
          @top_constraint = top_constraint.to_s
          @top_constraint_level_id = top_constraint_level_id&.to_s
          @top_offset_mm = Float(top_offset_mm)
          @location_line = location_line.to_s
          @room_bounding = !!room_bounding
          @phase_lifecycle = phase_lifecycle.to_s
          @joins = normalize_joins(joins).freeze
          @constraints = Array(constraints).map { |constraint| (constraint || {}).dup.freeze }.freeze
          freeze
        end

        def valid?
          errors.empty?
        end

        def errors
          result = []
          result << 'wall path requires at least two points' if path_mm.length < 2
          result << 'wall thickness must be greater than zero' unless thickness_mm.positive?
          result << 'wall height must be greater than zero' unless height_mm.positive?
          result << 'wall top constraint is invalid' unless TOP_CONSTRAINTS.include?(top_constraint)
          result << 'wall top constraint level is required' if top_constraint == 'level' && top_constraint_level_id.to_s.empty?
          result << 'wall location line is invalid' unless LOCATION_LINES.include?(location_line)
          result << 'wall phase lifecycle is invalid' unless PHASE_LIFECYCLES.include?(phase_lifecycle)
          result << 'wall layer thickness does not match wall thickness' if layers.any? && (layers.sum { |layer| layer['thickness_mm'] } - thickness_mm).abs > 0.001
          result << 'wall core layer is not present' if core_layer_id && layers.none? { |layer| layer['id'] == core_layer_id }
          result << 'wall core layer is required for core location line' if location_line.start_with?('core') && core_layer_id.to_s.empty?
          result << 'wall path contains zero-length segment' if segment_lengths_mm.any? { |length| length <= 0.001 }
          result.concat(Core::ConstraintEngine.new.validate(constraints).map { |issue| "wall constraint #{issue[:index]}: #{issue[:message]}" }) unless constraints.empty?
          result
        end

        def length_mm
          segment_lengths_mm.sum
        end

        def gross_area_mm2
          length_mm * height_mm
        end

        def volume_mm3
          gross_area_mm2 * thickness_mm
        end

        def location_offset_mm
          case location_line
          when 'center' then 0.0
          when 'finish_face_exterior' then -thickness_mm / 2.0
          when 'finish_face_interior' then thickness_mm / 2.0
          when 'core_center' then layer_offset_mm(core_layer_id, center: true)
          when 'core_face_exterior' then layer_offset_mm(core_layer_id, center: false, exterior: true)
          when 'core_face_interior' then layer_offset_mm(core_layer_id, center: false, exterior: false)
          else 0.0
          end
        end

        # Converts the stored location line into the physical wall centerline
        # used by host and geometry adapters. A single offset is applied to
        # each vertex using the local averaged plan normal.
        def centerline_path_mm
          offset = location_offset_mm
          return path_mm if offset.abs <= 0.001

          path_mm.each_with_index.map do |point, index|
            previous = path_mm[[index - 1, 0].max]
            following = path_mm[[index + 1, path_mm.length - 1].min]
            dx = following[0] - previous[0]
            dy = following[1] - previous[1]
            length = Math.sqrt((dx * dx) + (dy * dy))
            next point if length <= 0.001

            [-dy / length, dx / length].then do |nx, ny|
              [point[0] + (nx * offset), point[1] + (ny * offset), point[2]].freeze
            end
          end.freeze
        end

        def location_path_point_from_centerline(point_mm, index)
          index = Integer(index)
          centerline_point = centerline_path_mm.fetch(index)
          stored_point = path_mm.fetch(index)
          point = Array(point_mm)
          raise ArgumentError, 'wall point requires x, y, z' unless point.length >= 3

          [
            Float(point[0]) - (centerline_point[0] - stored_point[0]),
            Float(point[1]) - (centerline_point[1] - stored_point[1]),
            Float(point[2])
          ].freeze
        end

        def with(path_mm: self.path_mm, thickness_mm: self.thickness_mm,
                 height_mm: self.height_mm, base_offset_mm: self.base_offset_mm,
                 wall_type_id: self.wall_type_id, orientation: self.orientation,
                 geometry_mode: self.geometry_mode, layers: self.layers,
                 core_layer_id: self.core_layer_id, base_level_id: self.base_level_id,
                 top_constraint: self.top_constraint, top_constraint_level_id: self.top_constraint_level_id,
                 top_offset_mm: self.top_offset_mm, location_line: self.location_line,
                 room_bounding: self.room_bounding, phase_lifecycle: self.phase_lifecycle,
                 joins: self.joins, constraints: self.constraints)
          self.class.new(
            path_mm: path_mm,
            thickness_mm: thickness_mm,
            height_mm: height_mm,
            base_offset_mm: base_offset_mm,
            wall_type_id: wall_type_id,
            orientation: orientation,
            geometry_mode: geometry_mode,
            layers: layers,
            core_layer_id: core_layer_id,
            base_level_id: base_level_id,
            top_constraint: top_constraint,
            top_constraint_level_id: top_constraint_level_id,
            top_offset_mm: top_offset_mm,
            location_line: location_line,
            room_bounding: room_bounding,
            phase_lifecycle: phase_lifecycle,
            joins: joins,
            constraints: constraints
          )
        end

        def apply_constraints
          return self if constraints.empty?

          points = path_mm.each_with_index.to_h { |point, index| ["p#{index}", point] }
          solved = Core::ConstraintEngine.new.solve(points: points, constraints: constraints)
          with(path_mm: path_mm.each_index.map { |index| solved.fetch("p#{index}") })
        end

        def translated(delta_mm)
          delta = Array(delta_mm)
          raise ArgumentError, 'wall translation requires x, y, z' if delta.length < 3

          dx, dy, dz = delta.first(3).map { |value| Float(value) }
          with(path_mm: path_mm.map { |point| [point[0] + dx, point[1] + dy, point[2] + dz] })
        end

        def flipped_orientation
          with(orientation: ORIENTATION_FLIPS.fetch(orientation, 'flipped'))
        end

        def stretched_endpoint(index:, point_mm:)
          point = Array(point_mm)
          raise ArgumentError, 'wall endpoint requires x, y, z' if point.length < 3

          endpoint_index = Integer(index)
          raise ArgumentError, 'wall endpoint index is outside the path' unless endpoint_index.between?(0, path_mm.length - 1)

          updated_path = path_mm.map(&:dup)
          updated_path[endpoint_index] = point.first(3).map { |value| Float(value) }
          with(path_mm: updated_path)
        end

        def translated_segment(index:, delta_mm:)
          segment_index = Integer(index)
          raise ArgumentError, 'wall segment index is outside the path' unless segment_index.between?(0, path_mm.length - 2)

          delta = Array(delta_mm)
          raise ArgumentError, 'wall segment translation requires x, y, z' if delta.length < 3

          dx, dy, dz = delta.first(3).map { |value| Float(value) }
          updated_path = path_mm.map(&:dup)
          [segment_index, segment_index + 1].each do |point_index|
            point = updated_path[point_index]
            updated_path[point_index] = [point[0] + dx, point[1] + dy, point[2] + dz]
          end
          with(path_mm: updated_path)
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'path_mm' => path_mm,
            'thickness_mm' => thickness_mm,
            'height_mm' => height_mm,
            'base_offset_mm' => base_offset_mm,
            'wall_type_id' => wall_type_id,
            'orientation' => orientation,
            'geometry_mode' => geometry_mode,
            'layers' => layers,
            'core_layer_id' => core_layer_id,
            'base_level_id' => base_level_id,
            'top_constraint' => top_constraint,
            'top_constraint_level_id' => top_constraint_level_id,
            'top_offset_mm' => top_offset_mm,
            'location_line' => location_line,
            'room_bounding' => room_bounding,
            'phase_lifecycle' => phase_lifecycle,
            'joins' => joins,
            'constraints' => constraints
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            path_mm: data['path_mm'] || data[:path_mm] || [],
            thickness_mm: data['thickness_mm'] || data[:thickness_mm] || DEFAULT_THICKNESS_MM,
            height_mm: data['height_mm'] || data[:height_mm] || DEFAULT_HEIGHT_MM,
            base_offset_mm: data['base_offset_mm'] || data[:base_offset_mm] || 0,
            wall_type_id: data['wall_type_id'] || data[:wall_type_id] || 'generic.wall.100',
            orientation: data['orientation'] || data[:orientation] || 'center',
            geometry_mode: data['geometry_mode'] || data[:geometry_mode] || 'parametric',
            layers: data['layers'] || data[:layers] || [],
            core_layer_id: data['core_layer_id'] || data[:core_layer_id],
            base_level_id: data['base_level_id'] || data[:base_level_id],
            top_constraint: data['top_constraint'] || data[:top_constraint] || 'unconnected',
            top_constraint_level_id: data['top_constraint_level_id'] || data[:top_constraint_level_id],
            top_offset_mm: data['top_offset_mm'] || data[:top_offset_mm] || 0,
            location_line: data['location_line'] || data[:location_line] || 'center',
            room_bounding: data.key?('room_bounding') ? data['room_bounding'] : data.fetch(:room_bounding, true),
            phase_lifecycle: data['phase_lifecycle'] || data[:phase_lifecycle] || 'new',
            joins: data['joins'] || data[:joins] || [],
            constraints: data['constraints'] || data[:constraints] || []
          )
        end

        private

        def normalize_path(path)
          Array(path).map do |point|
            values = Array(point)
            raise ArgumentError, 'wall path point requires x, y, z' unless values.length >= 3

            [Float(values[0]), Float(values[1]), Float(values[2])].freeze
          end
        end

        def normalize_layers(values)
          Array(values).map do |layer|
            data = layer || {}
            {
              'id' => (data['id'] || data[:id]).to_s,
              'name' => (data['name'] || data[:name] || data['id'] || data[:id]).to_s,
              'thickness_mm' => Float(data['thickness_mm'] || data[:thickness_mm]),
              'material_id' => (data['material_id'] || data[:material_id]).to_s,
              'role' => (data['role'] || data[:role] || 'finish').to_s
            }.freeze
          end
        end

        def normalize_joins(values)
          Array(values).map do |join|
            data = join || {}
            point = data['point_mm'] || data[:point_mm]
            segment_index = data['segment_index'] || data[:segment_index]
            angle_deg = data['angle_deg'] || data[:angle_deg]
            {
              'node_index' => Integer(data['node_index'] || data[:node_index] || 0),
              'segment_index' => segment_index.nil? ? nil : Integer(segment_index),
              'type' => (data['type'] || data[:type] || 'none').to_s,
              'style' => (data['style'] || data[:style] || 'miter').to_s,
              'allow' => data.key?('allow') ? !!data['allow'] : !!data.fetch(:allow, true),
              'related_wall_id' => (data['related_wall_id'] || data[:related_wall_id]).to_s,
              'angle_deg' => angle_deg.nil? ? nil : Float(angle_deg),
              'point_mm' => point.nil? ? nil : normalize_path([point]).first
            }.freeze
          end
        end

        def segment_lengths_mm
          path_mm.each_cons(2).map do |a, b|
            dx = b[0] - a[0]
            dy = b[1] - a[1]
            dz = b[2] - a[2]
            Math.sqrt((dx * dx) + (dy * dy) + (dz * dz))
          end.freeze
        end

        def layer_offset_mm(layer_id, center:, exterior: nil)
          layer = layers.find { |item| item['id'] == layer_id.to_s }
          return 0.0 unless layer

          start = -thickness_mm / 2.0 + layers.take_while { |item| item['id'] != layer['id'] }.sum { |item| item['thickness_mm'] }
          return start + (layer['thickness_mm'] / 2.0) if center

          exterior ? start : start + layer['thickness_mm']
        end
      end
    end
  end
end
