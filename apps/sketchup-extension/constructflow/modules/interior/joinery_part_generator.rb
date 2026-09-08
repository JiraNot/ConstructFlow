# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      class JoineryPartGenerator
        DEFAULT_EDGE_BAND_MM = 1.0

        def generate(cabinet_object_id:, definition:)
          raise ArgumentError, definition.errors.join('; ') unless definition.valid?

          parts = []
          hardware = []
          sequence = 0
          add_part = lambda do |attributes|
            sequence += 1
            parts << base_part(cabinet_object_id, sequence).merge(attributes)
          end

          body_height = definition.usable_height_mm
          body_depth = definition.depth_mm
          internal_width = [definition.usable_width_mm - (2.0 * definition.board_thickness_mm), 1.0].max
          board = definition.board_thickness_mm

          add_part.call(panel(
            role: 'side_left', length_mm: body_height, width_mm: body_depth,
            thickness_mm: board, material_id: definition.carcass_material_id,
            grain: 'length', edges: %w[front top bottom]
          ))
          add_part.call(panel(
            role: 'side_right', length_mm: body_height, width_mm: body_depth,
            thickness_mm: board, material_id: definition.carcass_material_id,
            grain: 'length', edges: %w[front top bottom]
          ))
          %w[top bottom].each do |role|
            add_part.call(panel(
              role: role, length_mm: internal_width, width_mm: body_depth,
              thickness_mm: board, material_id: definition.carcass_material_id,
              grain: 'length', edges: ['front']
            ))
          end

          if definition.back_thickness_mm.positive?
            add_part.call(panel(
              role: 'back', length_mm: definition.usable_width_mm,
              width_mm: body_height, thickness_mm: definition.back_thickness_mm,
              material_id: back_material_id(definition), grain: 'length', edges: []
            ))
          end

          [definition.modules.length - 1, 0].max.times do |index|
            add_part.call(panel(
              role: "partition_#{format('%02d', index + 1)}",
              length_mm: definition.opening_height_mm,
              width_mm: body_depth,
              thickness_mm: board,
              material_id: definition.carcass_material_id,
              grain: 'length', edges: ['front'], module_id: definition.modules[index]['id']
            ))
          end

          definition.fronts.each do |front|
            module_record = definition.module(front['module_id'])
            next unless module_record
            front_parts(front, module_record, definition).each do |part|
              add_part.call(part)
            end
            hardware.concat(front_hardware(front, definition))
          end

          definition.drawer_sets.each do |drawer_set|
            module_record = definition.module(drawer_set['module_id'])
            next unless module_record
            drawer_face_parts(drawer_set, module_record, definition).each do |part|
              add_part.call(part)
            end
            hardware << {
              'kind' => 'drawer_slide_pair',
              'module_id' => drawer_set['module_id'],
              'model' => drawer_set['slide_type'],
              'quantity' => Integer(drawer_set['count'])
            }
          end

          JoineryPartSetDefinition.new(
            cabinet_object_id: cabinet_object_id,
            parts: parts,
            hardware: aggregate_hardware(hardware)
          )
        end

        def hinge_count_for_height(height_mm)
          height = Float(height_mm)
          return 2 if height <= 900
          return 3 if height <= 1600
          4
        end

        private

        def base_part(cabinet_object_id, sequence)
          {
            'id' => "#{cabinet_object_id}-P#{format('%03d', sequence)}",
            'quantity' => 1,
            'material_class' => 'board'
          }
        end

        def panel(role:, length_mm:, width_mm:, thickness_mm:, material_id:, grain:, edges:,
                  module_id: nil, material_class: 'board')
          edge_band = {}
          edges.each do |edge|
            edge_band[edge] = %w[front back].include?(edge) ? Float(length_mm) : Float(width_mm)
          end
          {
            'role' => role,
            'module_id' => module_id,
            'length_mm' => Float(length_mm),
            'width_mm' => Float(width_mm),
            'thickness_mm' => Float(thickness_mm),
            'material_id' => material_id.to_s,
            'material_class' => material_class.to_s,
            'grain_direction' => grain.to_s,
            'edge_band_thickness_mm' => edges.empty? ? nil : DEFAULT_EDGE_BAND_MM,
            'edge_band_mm' => edge_band
          }
        end

        def front_parts(front, module_record, definition)
          return [] if front['front_type'] == 'open'
          module_width = Float(module_record['width_mm'])
          clear_width = [module_width - (2.0 * definition.front_gap_mm), 1.0].max
          clear_height = [definition.opening_height_mm - (2.0 * definition.front_gap_mm), 1.0].max
          material_class = %w[glass aluminium_frame_glass].include?(front['front_type']) ? 'glass' : 'board'
          thickness = material_class == 'glass' ? 6.0 : definition.board_thickness_mm
          count = front['front_type'] == 'double_swing' ? 2 : 1
          leaf_width = count == 2 ? [((clear_width - definition.front_gap_mm) / 2.0), 1.0].max : clear_width

          Array.new(count) do |index|
            panel(
              role: count == 1 ? 'front' : "front_leaf_#{index + 1}",
              module_id: front['module_id'],
              length_mm: clear_height,
              width_mm: leaf_width,
              thickness_mm: thickness,
              material_id: front['material_id'],
              material_class: material_class,
              grain: 'length',
              edges: material_class == 'board' ? %w[front back top bottom] : []
            ).merge('front_type' => front['front_type'], 'style' => front['style'])
          end
        end

        def drawer_face_parts(drawer_set, module_record, definition)
          width = [Float(module_record['width_mm']) - (2.0 * definition.front_gap_mm), 1.0].max
          Array(drawer_set['heights_mm']).each_with_index.map do |height, index|
            face_height = [Float(height) - definition.front_gap_mm, 1.0].max
            panel(
              role: "drawer_face_#{format('%02d', index + 1)}",
              module_id: drawer_set['module_id'],
              length_mm: face_height,
              width_mm: width,
              thickness_mm: definition.board_thickness_mm,
              material_id: drawer_set['face_material_id'],
              grain: 'width',
              edges: %w[front back top bottom]
            )
          end
        end

        def front_hardware(front, definition)
          case front['front_type']
          when 'single_swing', 'glass', 'aluminium_frame_glass'
            [{ 'kind' => 'hinge', 'module_id' => front['module_id'], 'quantity' => hinge_count_for_height(definition.opening_height_mm) }]
          when 'double_swing'
            [{ 'kind' => 'hinge', 'module_id' => front['module_id'], 'quantity' => hinge_count_for_height(definition.opening_height_mm) * 2 }]
          when 'sliding'
            [{ 'kind' => 'sliding_track_set', 'module_id' => front['module_id'], 'quantity' => 1 }]
          else
            []
          end
        end

        def aggregate_hardware(records)
          records.group_by { |record| [record['kind'], record['module_id'], record['model']] }.map do |(kind, module_id, model), items|
            {
              'kind' => kind,
              'module_id' => module_id,
              'model' => model,
              'quantity' => items.sum { |item| Integer(item['quantity'] || 0) }
            }
          end
        end

        def back_material_id(definition)
          "#{definition.carcass_material_id}.back.#{definition.back_thickness_mm.round}"
        end
      end
    end
  end
end
