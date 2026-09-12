# frozen_string_literal: true

require 'csv'

module JiraNot
  module ConstructFlow
    module Interior
      class CutListExporter
        DEFAULT_EDGE_BAND_THICKNESS_MM = 1.0

        def export(part_set, default_edge_band_thickness_mm: DEFAULT_EDGE_BAND_THICKNESS_MM)
          parts = part_set.respond_to?(:parts) ? part_set.parts : Array(part_set)

          rows = generate_rows(parts, default_edge_band_thickness_mm)
          edge_schedule = generate_edge_schedule(parts, default_edge_band_thickness_mm)
          hardware_schedule = generate_hardware_schedule(part_set)

          {
            rows: rows,
            csv: to_csv(rows),
            edge_banding_schedule: edge_schedule,
            hardware_schedule: hardware_schedule,
            total_parts_count: rows.sum { |r| r[:quantity] }
          }
        end

        def generate_rows(parts, default_eb_thickness)
          parts.map do |part|
            fin_len = Float(part['length_mm'] || 0.0)
            fin_wid = Float(part['width_mm'] || 0.0)
            thickness = Float(part['thickness_mm'] || 0.0)
            qty = [Integer(part['quantity'] || 1), 1].max
            grain = (part['grain_direction'] || 'none').to_s

            eb_hash = part.fetch('edge_band_mm', {}) || {}
            eb_thickness = Float(part['edge_band_thickness_mm'] || default_eb_thickness)

            # Deductions for cut size
            # front/back edges run along length, top/bottom edges run along width
            # Length deduction occurs if top or bottom edges are banded
            # Width deduction occurs if front or back edges are banded
            deduct_len = 0.0
            deduct_len += eb_thickness if eb_hash.key?('top')
            deduct_len += eb_thickness if eb_hash.key?('bottom')

            deduct_wid = 0.0
            deduct_wid += eb_thickness if eb_hash.key?('front')
            deduct_wid += eb_thickness if eb_hash.key?('back')

            cut_len = [fin_len - deduct_len, 0.0].max.round(1)
            cut_wid = [fin_wid - deduct_wid, 0.0].max.round(1)

            {
              part_id: part['id'].to_s,
              role: part['role'].to_s,
              module_id: part['module_id']&.to_s || '-',
              material_id: part['material_id'].to_s,
              material_class: (part['material_class'] || 'board').to_s,
              thickness_mm: thickness.round(1),
              cut_length_mm: cut_len,
              cut_width_mm: cut_wid,
              finished_length_mm: fin_len.round(1),
              finished_width_mm: fin_wid.round(1),
              quantity: qty,
              grain_direction: grain,
              edge_front: eb_hash.key?('front') ? "#{eb_thickness}mm" : '-',
              edge_back: eb_hash.key?('back') ? "#{eb_thickness}mm" : '-',
              edge_top: eb_hash.key?('top') ? "#{eb_thickness}mm" : '-',
              edge_bottom: eb_hash.key?('bottom') ? "#{eb_thickness}mm" : '-'
            }
          end
        end

        def to_csv(rows)
          headers = [
            'Part ID', 'Role', 'Module', 'Material', 'Class', 'Thickness (mm)',
            'Cut Length (mm)', 'Cut Width (mm)', 'Finished Length (mm)', 'Finished Width (mm)',
            'Quantity', 'Grain', 'Edge Front', 'Edge Back', 'Edge Top', 'Edge Bottom'
          ]

          CSV.generate do |csv|
            csv << headers
            rows.each do |r|
              csv << [
                r[:part_id], r[:role], r[:module_id], r[:material_id], r[:material_class],
                r[:thickness_mm], r[:cut_length_mm], r[:cut_width_mm],
                r[:finished_length_mm], r[:finished_width_mm], r[:quantity],
                r[:grain_direction], r[:edge_front], r[:edge_back], r[:edge_top], r[:edge_bottom]
              ]
            end
          end
        end

        def generate_edge_schedule(parts, default_eb_thickness)
          summary = Hash.new { |h, k| h[k] = { total_length_mm: 0.0, part_count: 0 } }

          parts.each do |part|
            eb_hash = part.fetch('edge_band_mm', {}) || {}
            next if eb_hash.empty?

            eb_thickness = Float(part['edge_band_thickness_mm'] || default_eb_thickness)
            spec_name = "Edge Tape #{eb_thickness}mm"
            qty = [Integer(part['quantity'] || 1), 1].max

            part_eb_len = eb_hash.values.sum { |v| Float(v) } * qty
            summary[spec_name][:total_length_mm] += part_eb_len
            summary[spec_name][:part_count] += qty
          end

          summary.map do |spec, data|
            total_m = (data[:total_length_mm] / 1000.0).round(2)
            {
              specification: spec,
              total_length_m: total_m,
              total_length_mm: data[:total_length_mm].round(1),
              part_count: data[:part_count]
            }
          end
        end

        def generate_hardware_schedule(part_set)
          raw_hardware = part_set.respond_to?(:hardware) ? part_set.hardware : []
          return [] if raw_hardware.empty?

          raw_hardware.group_by { |item| [item['kind'], item['model']] }.map do |(kind, model), items|
            total_qty = items.sum { |i| Integer(i['quantity'] || 0) }
            {
              kind: kind.to_s,
              model: model ? model.to_s : 'standard',
              quantity: total_qty
            }
          end
        end
      end
    end
  end
end
