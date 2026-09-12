# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class JoineryShopDrawingDefinition
        attr_reader :title, :cabinet_run_id, :overall_dimensions_mm, :front_elevation,
                    :top_plan, :side_section, :dimensions, :hardware_summary

        def initialize(title:, cabinet_run_id:, overall_dimensions_mm:,
                       front_elevation:, top_plan:, side_section:,
                       dimensions: [], hardware_summary: {})
          @title = title.to_s.strip
          @cabinet_run_id = cabinet_run_id.to_s.strip
          @overall_dimensions_mm = Array(overall_dimensions_mm).map { |v| Float(v) }.freeze
          @front_elevation = front_elevation.freeze
          @top_plan = top_plan.freeze
          @side_section = side_section.freeze
          @dimensions = Array(dimensions).freeze
          @hardware_summary = hardware_summary.freeze
          freeze
        end

        def to_h
          {
            'title' => title,
            'cabinet_run_id' => cabinet_run_id,
            'overall_dimensions_mm' => overall_dimensions_mm,
            'front_elevation' => front_elevation,
            'top_plan' => top_plan,
            'side_section' => side_section,
            'dimensions' => dimensions,
            'hardware_summary' => hardware_summary
          }
        end
      end

      class JoineryShopDrawingGenerator
        def generate(cabinet_run:, part_set: nil, title: nil)
          run_id = get_val(cabinet_run, :id) || get_val(cabinet_run, :run_id) || 'cabinet_run'
          w = get_float(cabinet_run, :total_width_mm, 2000.0)
          h = get_float(cabinet_run, :height_mm, 850.0)
          d = get_float(cabinet_run, :depth_mm, 600.0)
          toe_kick_h = get_float(cabinet_run, :toe_kick_height_mm, 100.0)
          counter_t = get_float(cabinet_run, :countertop_thickness_mm, 30.0)
          carcass_h = h - toe_kick_h - counter_t

          modules = get_val(cabinet_run, :modules) || []
          if modules.empty?
            # Default split into modules
            mod_count = [(w / 600.0).round, 1].max
            mod_w = (w / mod_count).round(1)
            modules = Array.new(mod_count) { { width_mm: mod_w, type: 'door' } }
          end

          dwg_title = title || "Shop Drawing - #{run_id}"

          # Front elevation elements
          front_elements = []
          curr_x = 0.0
          dim_chain = []

          # Toe kick strip
          front_elements << {
            type: 'toe_kick',
            x: 0.0,
            y: 0.0,
            width: w,
            height: toe_kick_h
          }

          modules.each_with_index do |mod, idx|
            mw = get_float(mod, :width_mm, 600.0)
            m_type = get_val(mod, :type) || 'door'

            # Carcass box
            front_elements << {
              type: 'module_carcass',
              module_index: idx,
              module_type: m_type,
              x: curr_x,
              y: toe_kick_h,
              width: mw,
              height: carcass_h
            }

            # Drawer or door panels
            if m_type == 'drawers'
              drawer_h = (carcass_h / 3.0).round(1)
              3.times do |di|
                front_elements << {
                  type: 'drawer_front',
                  x: curr_x + 2.0,
                  y: toe_kick_h + (di * drawer_h) + 2.0,
                  width: mw - 4.0,
                  height: drawer_h - 4.0
                }
              end
            else
              front_elements << {
                type: 'door_front',
                x: curr_x + 2.0,
                y: toe_kick_h + 2.0,
                width: mw - 4.0,
                height: carcass_h - 4.0,
                swing: idx.even? ? 'left' : 'right'
              }
            end

            dim_chain << { name: "Mod #{idx + 1}", start_mm: curr_x, length_mm: mw }
            curr_x += mw
          end

          # Countertop slab on top
          front_elements << {
            type: 'countertop',
            x: -20.0,
            y: toe_kick_h + carcass_h,
            width: w + 40.0,
            height: counter_t
          }

          # Top Plan elements
          top_plan = {
            width_mm: w,
            depth_mm: d,
            overhang_mm: 20.0,
            modules: modules.map.with_index { |m, i| { index: i, width: get_float(m, :width_mm, 600.0) } }
          }

          # Side Section elements
          side_section = {
            depth_mm: d,
            total_height_mm: h,
            toe_kick_recess_mm: 50.0,
            carcass_depth_mm: d - 20.0,
            shelves: [
              { z: toe_kick_h + (carcass_h * 0.5).round(1) }
            ]
          }

          dimensions = [
            { type: 'overall_width', value_mm: w },
            { type: 'overall_height', value_mm: h },
            { type: 'overall_depth', value_mm: d },
            { type: 'toe_kick_height', value_mm: toe_kick_h },
            { type: 'countertop_height', value_mm: counter_t },
            { type: 'module_widths', segments: dim_chain }
          ]

          # Extract hardware summary from part_set if present
          hw_summary = if part_set.respond_to?(:hardware_items)
                         part_set.hardware_items
                       else
                         { 'concealed_hinges' => modules.length * 2, 'drawer_runners' => 0, 'handles' => modules.length }
                       end

          JoineryShopDrawingDefinition.new(
            title: dwg_title,
            cabinet_run_id: run_id,
            overall_dimensions_mm: [w, d, h],
            front_elevation: front_elements,
            top_plan: top_plan,
            side_section: side_section,
            dimensions: dimensions,
            hardware_summary: hw_summary
          )
        end

        private

        def get_float(obj, key, default)
          val = get_val(obj, key)
          val ? Float(val) : default
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
