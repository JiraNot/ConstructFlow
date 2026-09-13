# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class TakeoffHUDService
        def self.compute(runtime, target_entities = nil)
          model = runtime&.active_model || (defined?(Sketchup) ? Sketchup.active_model : nil)
          return empty_result unless model

          selection = target_entities || (model.respond_to?(:selection) ? model.selection.to_a : [])
          is_all = false
          if selection.empty?
            is_all = true
            ents = model.respond_to?(:active_entities) ? model.active_entities : []
            selection = ents.select do |e|
              (e.respond_to?(:get_attribute) && (e.get_attribute('ConstructFlow', 'type_id') || e.get_attribute('ConstructFlow', 'object_type')))
            end
          end

          concrete_m3 = 0.0
          formwork_m2 = 0.0
          wall_net_m2 = 0.0
          tile_floor_m2 = 0.0
          skirting_m = 0.0
          ceiling_m2 = 0.0
          paint_m2 = 0.0

          columns = []
          beams = []
          floors = []

          selection.each do |e|
            next unless e.respond_to?(:get_attribute)
            type_id = (e.get_attribute('ConstructFlow', 'type_id') || e.get_attribute('ConstructFlow', 'object_type')).to_s

            if type_id.include?('column')
              columns << e
              w = (e.get_attribute('ConstructFlow', 'width_mm') || 300.0).to_f / 1000.0
              d = (e.get_attribute('ConstructFlow', 'depth_mm') || 300.0).to_f / 1000.0
              h = (e.get_attribute('ConstructFlow', 'height_mm') || 3500.0).to_f / 1000.0
              vol = w * d * h
              fw = 2.0 * (w + d) * h
              concrete_m3 += vol
              formwork_m2 += fw

            elsif type_id.include?('beam')
              beams << e
              w = (e.get_attribute('ConstructFlow', 'width_mm') || 200.0).to_f / 1000.0
              d = (e.get_attribute('ConstructFlow', 'depth_mm') || 400.0).to_f / 1000.0
              len = (e.get_attribute('ConstructFlow', 'length_mm') || 4000.0).to_f / 1000.0
              vol = w * d * len
              fw = (2.0 * d + w) * len
              concrete_m3 += vol
              formwork_m2 += fw

            elsif type_id.include?('wall')
              gross = (e.get_attribute('ConstructFlow', 'gross_area_mm2') || 0.0).to_f / 1_000_000.0
              net = (e.get_attribute('ConstructFlow', 'net_area_mm2') || gross).to_f / 1_000_000.0
              if net <= 0.0 && e.respond_to?(:bounds)
                bb = e.bounds
                net = (to_meters(bb.width) * to_meters(bb.depth))
              end
              wall_net_m2 += net
              paint_m2 += (net * 2.0)

            elsif type_id.include?('floor') || type_id.include?('slab')
              floors << e
              thick = (e.get_attribute('ConstructFlow', 'thickness_mm') || 150.0).to_f / 1000.0
              area = (e.get_attribute('ConstructFlow', 'area_m2') || 0.0).to_f
              if area <= 0.01 && e.respond_to?(:bounds)
                bb = e.bounds
                area = to_meters(bb.width) * to_meters(bb.height)
              end
              concrete_m3 += (area * thick)
              tile_floor_m2 += area
              ceiling_m2 += area
              if e.respond_to?(:bounds)
                bb = e.bounds
                skirting_m += 2.0 * (to_meters(bb.width) + to_meters(bb.height))
              end

            elsif type_id.include?('foundation')
              vol = (e.get_attribute('ConstructFlow', 'volume_m3') || 0.25).to_f
              fw = (e.get_attribute('ConstructFlow', 'formwork_m2') || 1.8).to_f
              concrete_m3 += vol
              formwork_m2 += fw
            end
          end

          # Structural hierarchy auto-deduction
          if columns.any? && beams.any?
            columns.each do |col|
              next unless col.respond_to?(:bounds)
              col_bb = col.bounds
              beams.each do |bm|
                next unless bm.respond_to?(:bounds)
                bm_bb = bm.bounds
                inter = col_bb.intersect(bm_bb) rescue nil
                if inter && inter.respond_to?(:valid?) && inter.valid?
                  overlap_vol = to_meters(inter.width) * to_meters(inter.height) * to_meters(inter.depth)
                  concrete_m3 -= overlap_vol if overlap_vol > 0.001
                end
              end
            end
          end

          concrete_m3 = [concrete_m3, 0.0].max
          formwork_m2 = [formwork_m2, 0.0].max

          {
            'status' => 'success',
            'is_all_model' => is_all,
            'selection_count' => selection.length,
            'concrete_m3' => concrete_m3.round(2),
            'formwork_m2' => formwork_m2.round(2),
            'wall_net_m2' => wall_net_m2.round(2),
            'tile_floor_m2' => tile_floor_m2.round(2),
            'skirting_m' => skirting_m.round(2),
            'ceiling_m2' => ceiling_m2.round(2),
            'paint_m2' => paint_m2.round(2)
          }
        end

        def self.to_meters(val)
          return 0.0 unless val
          if val.respond_to?(:to_m)
            val.to_m
          elsif val > 50.0 # likely in mm
            val.to_f / 1000.0
          else
            val.to_f
          end
        end

        def self.empty_result
          {
            'status' => 'success',
            'is_all_model' => true,
            'selection_count' => 0,
            'concrete_m3' => 0.0,
            'formwork_m2' => 0.0,
            'wall_net_m2' => 0.0,
            'tile_floor_m2' => 0.0,
            'skirting_m' => 0.0,
            'ceiling_m2' => 0.0,
            'paint_m2' => 0.0
          }
        end
      end
    end
  end
end
