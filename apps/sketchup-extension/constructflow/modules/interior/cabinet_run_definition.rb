# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      class CabinetRunDefinition
        SCHEMA_VERSION = 1
        MODES = %w[design fabrication].freeze
        FRONT_TYPES = %w[single_swing double_swing sliding open glass aluminium_frame_glass].freeze
        FRONT_STYLES = %w[flat shaker raised routed grooved glass slatted].freeze
        MIN_MODULE_WIDTH_MM = 150.0
        TOLERANCE_MM = 0.5

        attr_reader :origin_mm, :angle_deg, :width_mm, :height_mm, :depth_mm,
                    :board_thickness_mm, :back_thickness_mm, :toe_kick_mm,
                    :left_filler_mm, :right_filler_mm, :top_filler_mm,
                    :carcass_material_id, :front_gap_mm, :mode,
                    :modules, :fronts, :drawer_sets, :host_object_id

        def initialize(origin_mm:, width_mm:, height_mm:, depth_mm:, angle_deg: 0,
                       board_thickness_mm: 18, back_thickness_mm: 9, toe_kick_mm: 100,
                       left_filler_mm: 0, right_filler_mm: 0, top_filler_mm: 0,
                       carcass_material_id: 'board.hmr.18', front_gap_mm: 2,
                       mode: 'design', modules: nil, fronts: [], drawer_sets: [],
                       host_object_id: nil)
          @origin_mm = normalize_point(origin_mm).freeze
          @angle_deg = Float(angle_deg)
          @width_mm = Float(width_mm)
          @height_mm = Float(height_mm)
          @depth_mm = Float(depth_mm)
          @board_thickness_mm = Float(board_thickness_mm)
          @back_thickness_mm = Float(back_thickness_mm)
          @toe_kick_mm = Float(toe_kick_mm)
          @left_filler_mm = Float(left_filler_mm)
          @right_filler_mm = Float(right_filler_mm)
          @top_filler_mm = Float(top_filler_mm)
          @carcass_material_id = carcass_material_id.to_s
          @front_gap_mm = Float(front_gap_mm)
          @mode = mode.to_s
          @host_object_id = host_object_id&.to_s
          initial_modules = modules.nil? ? default_modules : modules
          @modules = normalize_records(initial_modules).freeze
          @fronts = normalize_records(fronts).freeze
          @drawer_sets = normalize_records(drawer_sets).freeze
          freeze
        end

        def errors
          result = []
          result << 'cabinet width must be greater than zero' unless width_mm.positive?
          result << 'cabinet height must be greater than zero' unless height_mm.positive?
          result << 'cabinet depth must be greater than zero' unless depth_mm.positive?
          result << 'board thickness must be greater than zero' unless board_thickness_mm.positive?
          result << 'back thickness cannot be negative' if back_thickness_mm.negative?
          result << 'toe kick cannot be negative or exceed cabinet height' if toe_kick_mm.negative? || toe_kick_mm >= height_mm
          result << 'fillers cannot be negative' if [left_filler_mm, right_filler_mm, top_filler_mm].any?(&:negative?)
          result << 'fillers consume all cabinet width' unless usable_width_mm.positive?
          result << 'top filler consumes all cabinet height' unless usable_height_mm.positive?
          result << 'front gap cannot be negative' if front_gap_mm.negative?
          result << 'unsupported cabinet mode' unless MODES.include?(mode)
          result << 'carcass material id required' if carcass_material_id.empty?
          result.concat(module_errors)
          result.concat(front_errors)
          result.concat(drawer_errors)
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def usable_width_mm
          width_mm - left_filler_mm - right_filler_mm
        end

        def usable_height_mm
          height_mm - top_filler_mm
        end

        def opening_height_mm
          [usable_height_mm - toe_kick_mm, 0.0].max
        end

        def module_width_sum_mm
          modules.sum { |mod| Float(mod['width_mm']) }
        end

        def module_ids
          modules.map { |mod| mod['id'] }.freeze
        end

        def module_offsets_mm
          cursor = left_filler_mm
          modules.map do |mod|
            width = Float(mod['width_mm'])
            record = {
              'id' => mod['id'],
              'start_mm' => cursor,
              'end_mm' => cursor + width,
              'width_mm' => width
            }.freeze
            cursor += width
            record
          end.freeze
        end

        def module_record(module_id)
          modules.find { |mod| mod['id'] == module_id.to_s }
        end

        def front_for(module_id)
          fronts.find { |front| front['module_id'] == module_id.to_s }
        end

        def drawer_set_for(module_id)
          drawer_sets.find { |set| set['module_id'] == module_id.to_s }
        end

        def split_equal(count:, min_width_mm: MIN_MODULE_WIDTH_MM)
          value = Integer(count)
          raise ArgumentError, 'module count must be at least 1' if value < 1
          width = usable_width_mm / value
          raise ArgumentError, "module width #{width.round(1)} mm is below minimum #{Float(min_width_mm).round(1)} mm" if width < Float(min_width_mm)

          next_modules = Array.new(value) do |index|
            { 'id' => format('M%02d', index + 1), 'width_mm' => width }
          end
          with(modules: next_modules, fronts: remap_assignments(fronts, next_modules), drawer_sets: remap_assignments(drawer_sets, next_modules))
        end

        def split_explicit(widths_mm:, min_width_mm: MIN_MODULE_WIDTH_MM)
          widths = Array(widths_mm).map { |value| Float(value) }
          raise ArgumentError, 'at least one module width required' if widths.empty?
          if widths.any? { |width| width < Float(min_width_mm) }
            raise ArgumentError, "module width below minimum #{Float(min_width_mm).round(1)} mm"
          end
          delta = widths.sum - usable_width_mm
          raise ArgumentError, format('module widths must total usable width %.2f mm (delta %.2f mm)', usable_width_mm, delta) if delta.abs > TOLERANCE_MM

          next_modules = widths.each_with_index.map do |width, index|
            { 'id' => format('M%02d', index + 1), 'width_mm' => width }
          end
          with(modules: next_modules, fronts: remap_assignments(fronts, next_modules), drawer_sets: remap_assignments(drawer_sets, next_modules))
        end

        def assign_front(module_id:, front_type:, style: 'flat', material_id: 'front.hmr.18')
          id = module_id.to_s
          raise ArgumentError, "unknown cabinet module: #{id}" unless module_record(id)
          type = front_type.to_s
          front_style = style.to_s
          raise ArgumentError, "unsupported front type: #{type}" unless FRONT_TYPES.include?(type)
          raise ArgumentError, "unsupported front style: #{front_style}" unless FRONT_STYLES.include?(front_style)

          next_fronts = fronts.reject { |front| front['module_id'] == id }.map(&:dup)
          next_fronts << {
            'module_id' => id,
            'front_type' => type,
            'style' => front_style,
            'material_id' => material_id.to_s
          }
          with(fronts: next_fronts)
        end

        def add_drawer_set(module_id:, count:, slide_type: 'soft_close', heights_mm: nil,
                           face_material_id: 'front.hmr.18')
          id = module_id.to_s
          raise ArgumentError, "unknown cabinet module: #{id}" unless module_record(id)
          drawer_count = Integer(count)
          raise ArgumentError, 'drawer count must be at least 1' if drawer_count < 1
          heights = if heights_mm.nil? || Array(heights_mm).empty?
                      Array.new(drawer_count, opening_height_mm / drawer_count)
                    else
                      Array(heights_mm).map { |value| Float(value) }
                    end
          raise ArgumentError, 'drawer heights count must match drawer count' unless heights.length == drawer_count
          raise ArgumentError, 'drawer heights must be greater than zero' if heights.any? { |value| value <= 0 }
          raise ArgumentError, 'drawer heights exceed available opening height' if heights.sum > opening_height_mm + TOLERANCE_MM

          next_sets = drawer_sets.reject { |set| set['module_id'] == id }.map(&:dup)
          next_sets << {
            'module_id' => id,
            'count' => drawer_count,
            'heights_mm' => heights,
            'slide_type' => slide_type.to_s,
            'face_material_id' => face_material_id.to_s
          }
          with(drawer_sets: next_sets)
        end

        def with(origin_mm: self.origin_mm, angle_deg: self.angle_deg,
                 width_mm: self.width_mm, height_mm: self.height_mm, depth_mm: self.depth_mm,
                 board_thickness_mm: self.board_thickness_mm,
                 back_thickness_mm: self.back_thickness_mm, toe_kick_mm: self.toe_kick_mm,
                 left_filler_mm: self.left_filler_mm, right_filler_mm: self.right_filler_mm,
                 top_filler_mm: self.top_filler_mm, carcass_material_id: self.carcass_material_id,
                 front_gap_mm: self.front_gap_mm, mode: self.mode, modules: self.modules,
                 fronts: self.fronts, drawer_sets: self.drawer_sets,
                 host_object_id: self.host_object_id)
          self.class.new(
            origin_mm: origin_mm,
            angle_deg: angle_deg,
            width_mm: width_mm,
            height_mm: height_mm,
            depth_mm: depth_mm,
            board_thickness_mm: board_thickness_mm,
            back_thickness_mm: back_thickness_mm,
            toe_kick_mm: toe_kick_mm,
            left_filler_mm: left_filler_mm,
            right_filler_mm: right_filler_mm,
            top_filler_mm: top_filler_mm,
            carcass_material_id: carcass_material_id,
            front_gap_mm: front_gap_mm,
            mode: mode,
            modules: modules,
            fronts: fronts,
            drawer_sets: drawer_sets,
            host_object_id: host_object_id
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'origin_mm' => origin_mm,
            'angle_deg' => angle_deg,
            'width_mm' => width_mm,
            'height_mm' => height_mm,
            'depth_mm' => depth_mm,
            'board_thickness_mm' => board_thickness_mm,
            'back_thickness_mm' => back_thickness_mm,
            'toe_kick_mm' => toe_kick_mm,
            'left_filler_mm' => left_filler_mm,
            'right_filler_mm' => right_filler_mm,
            'top_filler_mm' => top_filler_mm,
            'carcass_material_id' => carcass_material_id,
            'front_gap_mm' => front_gap_mm,
            'mode' => mode,
            'modules' => modules,
            'fronts' => fronts,
            'drawer_sets' => drawer_sets,
            'host_object_id' => host_object_id
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            origin_mm: data['origin_mm'] || data[:origin_mm] || [0, 0, 0],
            angle_deg: data['angle_deg'] || data[:angle_deg] || 0,
            width_mm: data['width_mm'] || data[:width_mm] || 600,
            height_mm: data['height_mm'] || data[:height_mm] || 800,
            depth_mm: data['depth_mm'] || data[:depth_mm] || 600,
            board_thickness_mm: data['board_thickness_mm'] || data[:board_thickness_mm] || 18,
            back_thickness_mm: data['back_thickness_mm'] || data[:back_thickness_mm] || 9,
            toe_kick_mm: data['toe_kick_mm'] || data[:toe_kick_mm] || 100,
            left_filler_mm: data['left_filler_mm'] || data[:left_filler_mm] || 0,
            right_filler_mm: data['right_filler_mm'] || data[:right_filler_mm] || 0,
            top_filler_mm: data['top_filler_mm'] || data[:top_filler_mm] || 0,
            carcass_material_id: data['carcass_material_id'] || data[:carcass_material_id] || 'board.hmr.18',
            front_gap_mm: data['front_gap_mm'] || data[:front_gap_mm] || 2,
            mode: data['mode'] || data[:mode] || 'design',
            modules: data['modules'] || data[:modules],
            fronts: data['fronts'] || data[:fronts] || [],
            drawer_sets: data['drawer_sets'] || data[:drawer_sets] || [],
            host_object_id: data['host_object_id'] || data[:host_object_id]
          )
        end

        private

        def default_modules
          [{ 'id' => 'M01', 'width_mm' => usable_width_mm }]
        end

        def normalize_point(value)
          values = Array(value)
          raise ArgumentError, 'cabinet origin requires x, y, z' unless values.length >= 3
          [Float(values[0]), Float(values[1]), Float(values[2])]
        end

        def normalize_records(values)
          Array(values).map do |value|
            value.each_with_object({}) do |(key, item), result|
              result[key.to_s] = item.is_a?(Array) ? item.map { |entry| entry.is_a?(Numeric) ? Float(entry) : entry } : item
            end.freeze
          end
        end

        def module_errors
          result = []
          result << 'cabinet requires at least one module' if modules.empty?
          ids = module_ids
          result << 'cabinet module ids must be unique' unless ids.uniq.length == ids.length
          modules.each do |mod|
            width = Float(mod['width_mm'] || 0)
            result << "module #{mod['id']} width must be greater than zero" unless width.positive?
          end
          if (module_width_sum_mm - usable_width_mm).abs > TOLERANCE_MM
            result << format('module widths %.2f mm do not match usable cabinet width %.2f mm', module_width_sum_mm, usable_width_mm)
          end
          result
        end

        def front_errors
          fronts.filter_map do |front|
            module_id = front['module_id'].to_s
            if !module_ids.include?(module_id)
              "front references unknown module #{module_id}"
            elsif !FRONT_TYPES.include?(front['front_type'].to_s)
              "unsupported front type #{front['front_type']}"
            elsif !FRONT_STYLES.include?(front['style'].to_s)
              "unsupported front style #{front['style']}"
            end
          end
        end

        def drawer_errors
          drawer_sets.flat_map do |set|
            issues = []
            id = set['module_id'].to_s
            count = Integer(set['count'] || 0)
            heights = Array(set['heights_mm']).map { |value| Float(value) }
            issues << "drawer set references unknown module #{id}" unless module_ids.include?(id)
            issues << "drawer count for #{id} must be positive" unless count.positive?
            issues << "drawer heights count for #{id} does not match drawer count" unless heights.length == count
            issues << "drawer heights for #{id} exceed opening height" if heights.sum > opening_height_mm + TOLERANCE_MM
            issues
          end
        rescue ArgumentError, TypeError
          ['invalid drawer set data']
        end

        def remap_assignments(records, next_modules)
          ids = next_modules.map { |mod| mod['id'] }
          records.select { |record| ids.include?(record['module_id']) }.map(&:dup)
        end
      end
    end
  end
end
