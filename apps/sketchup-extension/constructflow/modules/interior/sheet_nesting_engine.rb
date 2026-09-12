# frozen_string_literal: true

require_relative 'nesting_result_definition'

module JiraNot
  module ConstructFlow
    module Interior
      class SheetNestingEngine
        def nest(cabinet_object_id:, part_set:,
                 sheet_width_mm: NestingResultDefinition::DEFAULT_SHEET_WIDTH_MM,
                 sheet_length_mm: NestingResultDefinition::DEFAULT_SHEET_LENGTH_MM,
                 saw_kerf_mm: NestingResultDefinition::DEFAULT_SAW_KERF_MM,
                 trim_margin_mm: NestingResultDefinition::DEFAULT_TRIM_MARGIN_MM)
          parts = part_set.respond_to?(:board_parts) ? part_set.board_parts : Array(part_set)

          usable_length = sheet_length_mm - (2.0 * trim_margin_mm)
          usable_width = sheet_width_mm - (2.0 * trim_margin_mm)

          raise ArgumentError, 'usable sheet length must be positive' unless usable_length.positive?
          raise ArgumentError, 'usable sheet width must be positive' unless usable_width.positive?

          grouped = parts.group_by { |p| [p['material_id'].to_s, Float(p['thickness_mm'] || 0.0)] }

          all_sheets = []
          unplaced = []
          sheet_counter = 0

          grouped.each do |(material_id, thickness_mm), group_parts|
            expanded_parts = []
            group_parts.each do |part|
              qty = [Integer(part['quantity'] || 1), 1].max
              qty.times do |q_idx|
                expanded_parts << part.dup.merge('_sub_id' => "#{part['id']}-#{q_idx + 1}")
              end
            end

            # Sort descending by area, then by max dimension
            sorted_parts = expanded_parts.sort_by do |p|
              len = Float(p['length_mm'])
              wid = Float(p['width_mm'])
              [-(len * wid), -[len, wid].max]
            end

            group_sheets = []

            sorted_parts.each do |part|
              p_len = Float(part['length_mm'])
              p_wid = Float(part['width_mm'])
              grain = (part['grain_direction'] || 'none').to_s

              orientations = determine_orientations(p_len, p_wid, grain)

              # Check if part is fundamentally too big for a sheet in all orientations
              can_fit_any = orientations.any? { |dx, dy, _| dx <= usable_length && dy <= usable_width }
              unless can_fit_any
                unplaced << part.merge('reason' => 'dimensions exceed usable sheet size')
                next
              end

              # Try to find best fit among open sheets
              best_placement = nil
              best_sheet = nil

              group_sheets.each do |sheet|
                fit = find_best_block(sheet[:free_blocks], orientations, saw_kerf_mm)
                next unless fit

                if best_placement.nil? || fit[:leftover_area] < best_placement[:leftover_area]
                  best_placement = fit
                  best_sheet = sheet
                end
              end

              # If no sheet has room, allocate a new sheet
              if best_placement.nil?
                sheet_counter += 1
                new_sheet = {
                  sheet_index: sheet_counter,
                  material_id: material_id,
                  thickness_mm: thickness_mm,
                  free_blocks: [{ x: trim_margin_mm, y: trim_margin_mm, w: usable_length, h: usable_width }],
                  placed_parts: []
                }
                group_sheets << new_sheet

                best_sheet = new_sheet
                best_placement = find_best_block(new_sheet[:free_blocks], orientations, saw_kerf_mm)
              end

              if best_placement.nil?
                unplaced << part.merge('reason' => 'failed to allocate placement')
                next
              end

              # Commit placement
              block = best_placement[:block]
              dx = best_placement[:dx]
              dy = best_placement[:dy]
              rotated = best_placement[:rotated]

              best_sheet[:free_blocks].delete(block)

              best_sheet[:placed_parts] << {
                'part_id' => part['_sub_id'] || part['id'],
                'original_part_id' => part['id'],
                'role' => part['role'],
                'module_id' => part['module_id'],
                'x_mm' => block[:x].round(2),
                'y_mm' => block[:y].round(2),
                'length_mm' => dx.round(2),
                'width_mm' => dy.round(2),
                'thickness_mm' => thickness_mm,
                'grain_direction' => grain,
                'rotated' => rotated,
                'edge_band_mm' => part['edge_band_mm']
              }

              # Split leftover space using Guillotine split
              alloc_w = dx + saw_kerf_mm
              alloc_h = dy + saw_kerf_mm

              rem_w = block[:w] - alloc_w
              rem_h = block[:h] - alloc_h

              # Shorter Axis Split
              if rem_w > 5.0 && rem_h > 5.0
                if rem_w > rem_h
                  # Split right block full height, top block above part
                  best_sheet[:free_blocks] << { x: block[:x] + alloc_w, y: block[:y], w: block[:w] - alloc_w, h: block[:h] }
                  best_sheet[:free_blocks] << { x: block[:x], y: block[:y] + alloc_h, w: alloc_w, h: block[:h] - alloc_h }
                else
                  # Split top block full width, right block beside part
                  best_sheet[:free_blocks] << { x: block[:x], y: block[:y] + alloc_h, w: block[:w], h: block[:h] - alloc_h }
                  best_sheet[:free_blocks] << { x: block[:x] + alloc_w, y: block[:y], w: block[:w] - alloc_w, h: alloc_h }
                end
              elsif rem_w > 5.0
                best_sheet[:free_blocks] << { x: block[:x] + alloc_w, y: block[:y], w: block[:w] - alloc_w, h: block[:h] }
              elsif rem_h > 5.0
                best_sheet[:free_blocks] << { x: block[:x], y: block[:y] + alloc_h, w: block[:w], h: block[:h] - alloc_h }
              end
            end

            group_sheets.each do |sheet|
              used_area = sheet[:placed_parts].sum { |p| p['length_mm'] * p['width_mm'] }
              sheet_area = sheet_width_mm * sheet_length_mm
              util_pct = ((used_area / sheet_area) * 100.0).round(2)

              all_sheets << {
                'sheet_index' => sheet[:sheet_index],
                'material_id' => sheet[:material_id],
                'thickness_mm' => sheet[:thickness_mm],
                'placed_parts' => sheet[:placed_parts],
                'used_area_mm2' => used_area.round(2),
                'sheet_area_mm2' => sheet_area.round(2),
                'utilization_pct' => util_pct
              }
            end
          end

          NestingResultDefinition.new(
            cabinet_object_id: cabinet_object_id,
            sheet_width_mm: sheet_width_mm,
            sheet_length_mm: sheet_length_mm,
            saw_kerf_mm: saw_kerf_mm,
            trim_margin_mm: trim_margin_mm,
            sheets: all_sheets,
            unplaced_parts: unplaced
          )
        end

        private

        def determine_orientations(length, width, grain)
          case grain
          when 'length'
            # Must stay along sheet length (X axis)
            [[length, width, false]]
          when 'width'
            # Width along sheet length
            [[width, length, true]]
          else
            # No grain constraint: try normal orientation first, then rotated 90°
            if length == width
              [[length, width, false]]
            else
              [[length, width, false], [width, length, true]]
            end
          end
        end

        def find_best_block(free_blocks, orientations, kerf)
          best = nil

          free_blocks.each do |block|
            orientations.each do |dx, dy, rotated|
              # Check if block can accommodate part with kerf
              next unless dx <= block[:w] && dy <= block[:h]

              leftover = (block[:w] * block[:h]) - (dx * dy)
              if best.nil? || leftover < best[:leftover_area]
                best = {
                  block: block,
                  dx: dx,
                  dy: dy,
                  rotated: rotated,
                  leftover_area: leftover
                }
              end
            end
          end

          best
        end
      end
    end
  end
end
