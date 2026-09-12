# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      class CncOperationGenerator
        SYSTEM_32_PITCH_MM = 32.0
        SYSTEM_32_SETBACK_MM = 37.0
        SHELF_PIN_HOLE_DIA_MM = 5.0
        SHELF_PIN_HOLE_DEPTH_MM = 12.0

        HINGE_CUP_DIA_MM = 35.0
        HINGE_CUP_DEPTH_MM = 12.5
        HINGE_CUP_SETBACK_MM = 21.5
        HINGE_END_MARGIN_MM = 100.0

        MINIFIX_CAM_DIA_MM = 15.0
        MINIFIX_CAM_DEPTH_MM = 12.0
        MINIFIX_CAM_SETBACK_MM = 34.0
        MINIFIX_END_MARGIN_MM = 50.0

        BACK_GROOVE_DEPTH_MM = 8.0
        BACK_GROOVE_SETBACK_MM = 15.0

        def generate(part_set, cabinet_definition: nil)
          parts = part_set.respond_to?(:parts) ? part_set.parts : Array(part_set)

          back_thickness = cabinet_definition ? Float(cabinet_definition.back_thickness_mm) : 9.0

          part_operations = parts.map do |part|
            role = part['role'].to_s
            len = Float(part['length_mm'] || 0.0)
            wid = Float(part['width_mm'] || 0.0)
            thickness = Float(part['thickness_mm'] || 18.0)

            ops = []

            case role
            when 'side_left', 'side_right', /^partition_/
              ops.concat(generate_system32_holes(len, wid))
              ops.concat(generate_back_groove(len, wid, back_thickness)) if back_thickness.positive?
            when 'top', 'bottom'
              ops.concat(generate_minifix_cam_holes(len, wid))
              ops.concat(generate_back_groove(len, wid, back_thickness)) if back_thickness.positive?
            when 'front', /^front_leaf_/
              ops.concat(generate_hinge_cup_holes(len, wid))
            end

            {
              part_id: part['id'].to_s,
              role: role,
              dimensions_mm: [len, wid, thickness],
              operations_count: ops.length,
              operations: ops
            }
          end

          {
            cabinet_object_id: part_set.respond_to?(:cabinet_object_id) ? part_set.cabinet_object_id : nil,
            total_operations: part_operations.sum { |po| po[:operations_count] },
            parts: part_operations
          }
        end

        private

        def generate_system32_holes(length, width)
          ops = []
          margin = 80.0
          usable_len = length - (2.0 * margin)
          return ops if usable_len < SYSTEM_32_PITCH_MM

          hole_count = (usable_len / SYSTEM_32_PITCH_MM).floor

          hole_count.times do |i|
            y = margin + (i * SYSTEM_32_PITCH_MM)
            # Front setback hole
            ops << {
              type: 'drill_face',
              tool: 'shelf_pin_drill_5mm',
              x_mm: SYSTEM_32_SETBACK_MM,
              y_mm: y.round(1),
              diameter_mm: SHELF_PIN_HOLE_DIA_MM,
              depth_mm: SHELF_PIN_HOLE_DEPTH_MM
            }
            # Rear setback hole
            ops << {
              type: 'drill_face',
              tool: 'shelf_pin_drill_5mm',
              x_mm: (width - SYSTEM_32_SETBACK_MM).round(1),
              y_mm: y.round(1),
              diameter_mm: SHELF_PIN_HOLE_DIA_MM,
              depth_mm: SHELF_PIN_HOLE_DEPTH_MM
            }
          end

          ops
        end

        def generate_hinge_cup_holes(length, width)
          ops = []
          return ops if length < (2.0 * HINGE_END_MARGIN_MM)

          # Hinge locations along length
          y_positions = [HINGE_END_MARGIN_MM, length - HINGE_END_MARGIN_MM]
          if length > 1200.0 && length <= 1800.0
            y_positions << (length / 2.0)
          elsif length > 1800.0
            y_positions << (length * 0.33)
            y_positions << (length * 0.67)
          end

          y_positions.sort.each do |y|
            # Main 35mm cup hole
            ops << {
              type: 'drill_face',
              tool: 'hinge_cup_forstner_35mm',
              x_mm: HINGE_CUP_SETBACK_MM,
              y_mm: y.round(1),
              diameter_mm: HINGE_CUP_DIA_MM,
              depth_mm: HINGE_CUP_DEPTH_MM
            }
            # Screw pilot holes (45mm spread)
            [-22.5, 22.5].each do |dy|
              ops << {
                type: 'drill_face',
                tool: 'pilot_drill_2_5mm',
                x_mm: (HINGE_CUP_SETBACK_MM + 9.5).round(1),
                y_mm: (y + dy).round(1),
                diameter_mm: 2.5,
                depth_mm: 10.0
              }
            end
          end

          ops
        end

        def generate_minifix_cam_holes(length, width)
          ops = []
          # 2 cams on each end of the panel
          [MINIFIX_END_MARGIN_MM, length - MINIFIX_END_MARGIN_MM].each do |x|
            [MINIFIX_CAM_SETBACK_MM, width - MINIFIX_CAM_SETBACK_MM].each do |y|
              ops << {
                type: 'drill_face',
                tool: 'minifix_cam_drill_15mm',
                x_mm: x.round(1),
                y_mm: y.round(1),
                diameter_mm: MINIFIX_CAM_DIA_MM,
                depth_mm: MINIFIX_CAM_DEPTH_MM
              }
              ops << {
                type: 'drill_edge',
                tool: 'dowel_drill_8mm',
                edge: x < length / 2.0 ? 'left' : 'right',
                y_mm: y.round(1),
                diameter_mm: 8.0,
                depth_mm: 30.0
              }
            end
          end
          ops
        end

        def generate_back_groove(length, width, back_thickness)
          [
            {
              type: 'groove',
              tool: 'router_bit',
              axis: 'y',
              start_x_mm: (width - BACK_GROOVE_SETBACK_MM - back_thickness).round(1),
              end_x_mm: (width - BACK_GROOVE_SETBACK_MM).round(1),
              start_y_mm: 0.0,
              end_y_mm: length.round(1),
              width_mm: back_thickness.round(1),
              depth_mm: BACK_GROOVE_DEPTH_MM
            }
          ]
        end
      end
    end
  end
end
