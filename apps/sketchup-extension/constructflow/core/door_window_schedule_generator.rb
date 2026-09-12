# frozen_string_literal: true

require 'csv'

module JiraNot
  module ConstructFlow
    module Core
      class DoorWindowScheduleItem
        attr_reader :type_id, :mark, :category, :name, :operation, :width_mm,
                    :height_mm, :frame_material, :frame_width_mm, :panel_style,
                    :clear_width_mm, :clear_height_mm, :quantity, :instance_ids

        def initialize(type_id:, mark:, category:, name:, operation:,
                       width_mm:, height_mm:, frame_material:, frame_width_mm:,
                       panel_style:, clear_width_mm:, clear_height_mm:,
                       quantity:, instance_ids: [])
          @type_id = type_id.to_s.strip
          @mark = mark.to_s.strip
          @category = category.to_s.strip.downcase
          @name = name.to_s.strip
          @operation = operation.to_s.strip
          @width_mm = Float(width_mm)
          @height_mm = Float(height_mm)
          @frame_material = frame_material.to_s.strip
          @frame_width_mm = Float(frame_width_mm)
          @panel_style = panel_style.to_s.strip
          @clear_width_mm = Float(clear_width_mm)
          @clear_height_mm = Float(clear_height_mm)
          @quantity = Integer(quantity)
          @instance_ids = Array(instance_ids).map(&:to_s).freeze
          freeze
        end

        def to_h
          {
            'type_id' => type_id,
            'mark' => mark,
            'category' => category,
            'name' => name,
            'operation' => operation,
            'width_mm' => width_mm,
            'height_mm' => height_mm,
            'frame_material' => frame_material,
            'frame_width_mm' => frame_width_mm,
            'panel_style' => panel_style,
            'clear_width_mm' => clear_width_mm,
            'clear_height_mm' => clear_height_mm,
            'quantity' => quantity,
            'instance_ids' => instance_ids
          }
        end
      end

      class DoorWindowScheduleGenerator
        def generate(instances:, types: {})
          type_map = normalize_types(types)
          grouped = Hash.new { |h, k| h[k] = [] }

          instances.each do |inst|
            t_id = get_type_id(inst)
            grouped[t_id] << inst
          end

          items = []
          grouped.keys.sort.each do |t_id|
            inst_list = grouped[t_id]
            type_obj = type_map[t_id]

            mark = derive_mark(t_id, type_obj, items)
            cat = type_obj ? type_obj.category : 'generic'
            name = type_obj ? type_obj.name : t_id
            op = type_obj ? type_obj.operation : 'fixed'
            w = type_obj ? type_obj.width_mm : 900.0
            h = type_obj ? type_obj.height_mm : 2000.0
            fm = type_obj ? type_obj.frame_material : 'aluminium'
            fw = type_obj ? type_obj.frame_width_mm : 50.0
            ps = type_obj ? type_obj.panel_style : 'glazed'
            cw = type_obj ? type_obj.clear_width_mm : (w - 2 * fw)
            ch = type_obj ? type_obj.clear_height_mm : (h - 2 * fw)

            inst_ids = inst_list.map { |i| get_val(i, :id) || get_val(i, :instance_id) }.compact

            items << DoorWindowScheduleItem.new(
              type_id: t_id,
              mark: mark,
              category: cat,
              name: name,
              operation: op,
              width_mm: w,
              height_mm: h,
              frame_material: fm,
              frame_width_mm: fw,
              panel_style: ps,
              clear_width_mm: cw,
              clear_height_mm: ch,
              quantity: inst_list.length,
              instance_ids: inst_ids
            )
          end

          {
            total_types: items.length,
            total_instances: items.sum(&:quantity),
            doors: items.select { |i| i.category == 'door' },
            windows: items.select { |i| i.category == 'window' },
            items: items,
            csv: generate_csv(items)
          }
        end

        private

        def normalize_types(types)
          if types.respond_to?(:types)
            types.types
          elsif types.is_a?(Hash)
            types
          elsif types.is_a?(Array)
            types.each_with_object({}) { |t, h| h[t.id] = t }
          else
            {}
          end
        end

        def get_type_id(inst)
          (get_val(inst, :type_id) || get_val(inst, :type) || 'unknown').to_s.strip
        end

        def derive_mark(type_id, type_obj, existing_items)
          return type_obj.name if type_obj&.name&.match?(/^[DW]\d+$/i)

          cat = type_obj ? type_obj.category.to_s.downcase : 'door'
          prefix = cat == 'window' ? 'W' : 'D'
          existing_count = existing_items.count { |i| i.category == cat }
          "#{prefix}#{existing_count + 1}"
        end

        def generate_csv(items)
          headers = [
            'Mark', 'Category', 'Type Name', 'Operation', 'Width (mm)', 'Height (mm)',
            'Clear Width (mm)', 'Clear Height (mm)', 'Frame Material', 'Panel Style', 'Quantity'
          ]
          CSV.generate do |csv|
            csv << headers
            items.each do |item|
              csv << [
                item.mark,
                item.category.capitalize,
                item.name,
                item.operation,
                item.width_mm,
                item.height_mm,
                item.clear_width_mm,
                item.clear_height_mm,
                item.frame_material,
                item.panel_style,
                item.quantity
              ]
            end
          end
        end

        def get_val(obj, key)
          if obj.respond_to?(key)
            obj.public_send(key)
          elsif obj.is_a?(Hash)
            obj[key] || obj[key.to_s]
          end
        end
      end
    end
  end
end
