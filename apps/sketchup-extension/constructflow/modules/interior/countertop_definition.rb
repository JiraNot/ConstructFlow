# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      class CountertopDefinition
        SCHEMA_VERSION = 1
        MATERIALS = %w[quartz granite marble solid_surface laminate compact_laminate sintered_stone stainless_steel].freeze
        DEFAULT_THICKNESS_MM = 20.0
        DEFAULT_FRONT_OVERHANG_MM = 25.0

        attr_reader :id, :cabinet_run_id, :length_mm, :depth_mm, :thickness_mm,
                    :front_overhang_mm, :back_overhang_mm, :left_overhang_mm,
                    :right_overhang_mm, :material_id, :splashback_height_mm,
                    :splashback_thickness_mm, :waterfall_left, :waterfall_right,
                    :waterfall_height_mm, :cutouts

        def initialize(id: nil, cabinet_run_id: nil, length_mm:, depth_mm:,
                       thickness_mm: DEFAULT_THICKNESS_MM,
                       front_overhang_mm: DEFAULT_FRONT_OVERHANG_MM,
                       back_overhang_mm: 0.0, left_overhang_mm: 15.0, right_overhang_mm: 15.0,
                       material_id: 'quartz', splashback_height_mm: 100.0,
                       splashback_thickness_mm: 20.0, waterfall_left: false,
                       waterfall_right: false, waterfall_height_mm: 850.0,
                       cutouts: [])
          @id = id&.to_s
          @cabinet_run_id = cabinet_run_id&.to_s
          @length_mm = Float(length_mm)
          @depth_mm = Float(depth_mm)
          @thickness_mm = Float(thickness_mm)
          @front_overhang_mm = Float(front_overhang_mm)
          @back_overhang_mm = Float(back_overhang_mm)
          @left_overhang_mm = Float(left_overhang_mm)
          @right_overhang_mm = Float(right_overhang_mm)
          @material_id = material_id.to_s
          @splashback_height_mm = Float(splashback_height_mm)
          @splashback_thickness_mm = Float(splashback_thickness_mm)
          @waterfall_left = waterfall_left == true
          @waterfall_right = waterfall_right == true
          @waterfall_height_mm = Float(waterfall_height_mm)
          @cutouts = normalize_cutouts(cutouts).freeze
          freeze
        end

        def errors
          result = []
          result << 'countertop length must be greater than zero' unless length_mm.positive?
          result << 'countertop depth must be greater than zero' unless depth_mm.positive?
          result << 'countertop thickness must be positive' unless thickness_mm.positive?
          result << 'unsupported countertop material' unless MATERIALS.include?(material_id)
          cutouts.each do |c|
            if c[:offset_x_mm] + c[:width_mm] > effective_length_mm
              result << "cutout #{c[:id]} exceeds countertop length"
            end
            if c[:offset_y_mm] + c[:depth_mm] > effective_depth_mm
              result << "cutout #{c[:id]} exceeds countertop depth"
            end
          end
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def effective_length_mm
          length_mm + left_overhang_mm + right_overhang_mm
        end

        def effective_depth_mm
          depth_mm + front_overhang_mm + back_overhang_mm
        end

        def gross_area_sqm
          (effective_length_mm * effective_depth_mm) / 1_000_000.0
        end

        def cutouts_area_sqm
          cutouts.sum { |c| (c[:width_mm] * c[:depth_mm]) } / 1_000_000.0
        end

        def net_area_sqm
          [gross_area_sqm - cutouts_area_sqm, 0.0].max
        end

        def waterfall_area_sqm
          count = (waterfall_left ? 1 : 0) + (waterfall_right ? 1 : 0)
          (count * effective_depth_mm * waterfall_height_mm) / 1_000_000.0
        end

        def splashback_area_sqm
          return 0.0 unless splashback_height_mm.positive?

          (effective_length_mm * splashback_height_mm) / 1_000_000.0
        end

        def total_stone_area_sqm
          net_area_sqm + waterfall_area_sqm + splashback_area_sqm
        end

        def with(**changes)
          self.class.new(
            id: changes.fetch(:id, id),
            cabinet_run_id: changes.fetch(:cabinet_run_id, cabinet_run_id),
            length_mm: changes.fetch(:length_mm, length_mm),
            depth_mm: changes.fetch(:depth_mm, depth_mm),
            thickness_mm: changes.fetch(:thickness_mm, thickness_mm),
            front_overhang_mm: changes.fetch(:front_overhang_mm, front_overhang_mm),
            back_overhang_mm: changes.fetch(:back_overhang_mm, back_overhang_mm),
            left_overhang_mm: changes.fetch(:left_overhang_mm, left_overhang_mm),
            right_overhang_mm: changes.fetch(:right_overhang_mm, right_overhang_mm),
            material_id: changes.fetch(:material_id, material_id),
            splashback_height_mm: changes.fetch(:splashback_height_mm, splashback_height_mm),
            splashback_thickness_mm: changes.fetch(:splashback_thickness_mm, splashback_thickness_mm),
            waterfall_left: changes.fetch(:waterfall_left, waterfall_left),
            waterfall_right: changes.fetch(:waterfall_right, waterfall_right),
            waterfall_height_mm: changes.fetch(:waterfall_height_mm, waterfall_height_mm),
            cutouts: changes.fetch(:cutouts, cutouts)
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'id' => id,
            'cabinet_run_id' => cabinet_run_id,
            'length_mm' => length_mm,
            'depth_mm' => depth_mm,
            'thickness_mm' => thickness_mm,
            'front_overhang_mm' => front_overhang_mm,
            'back_overhang_mm' => back_overhang_mm,
            'left_overhang_mm' => left_overhang_mm,
            'right_overhang_mm' => right_overhang_mm,
            'material_id' => material_id,
            'splashback_height_mm' => splashback_height_mm,
            'splashback_thickness_mm' => splashback_thickness_mm,
            'waterfall_left' => waterfall_left,
            'waterfall_right' => waterfall_right,
            'waterfall_height_mm' => waterfall_height_mm,
            'cutouts' => cutouts,
            'effective_length_mm' => effective_length_mm,
            'effective_depth_mm' => effective_depth_mm,
            'net_area_sqm' => net_area_sqm.round(4),
            'total_stone_area_sqm' => total_stone_area_sqm.round(4)
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            id: data['id'] || data[:id],
            cabinet_run_id: data['cabinet_run_id'] || data[:cabinet_run_id],
            length_mm: data['length_mm'] || data[:length_mm] || 0.0,
            depth_mm: data['depth_mm'] || data[:depth_mm] || 0.0,
            thickness_mm: data['thickness_mm'] || data[:thickness_mm] || DEFAULT_THICKNESS_MM,
            front_overhang_mm: data['front_overhang_mm'] || data[:front_overhang_mm] || DEFAULT_FRONT_OVERHANG_MM,
            back_overhang_mm: data['back_overhang_mm'] || data[:back_overhang_mm] || 0.0,
            left_overhang_mm: data['left_overhang_mm'] || data[:left_overhang_mm] || 15.0,
            right_overhang_mm: data['right_overhang_mm'] || data[:right_overhang_mm] || 15.0,
            material_id: data['material_id'] || data[:material_id] || 'quartz',
            splashback_height_mm: data['splashback_height_mm'] || data[:splashback_height_mm] || 100.0,
            splashback_thickness_mm: data['splashback_thickness_mm'] || data[:splashback_thickness_mm] || 20.0,
            waterfall_left: data['waterfall_left'] == true || data[:waterfall_left] == true,
            waterfall_right: data['waterfall_right'] == true || data[:waterfall_right] == true,
            waterfall_height_mm: data['waterfall_height_mm'] || data[:waterfall_height_mm] || 850.0,
            cutouts: data['cutouts'] || data[:cutouts] || []
          )
        end

        private

        def normalize_cutouts(list)
          Array(list).map do |c|
            item = (c || {}).transform_keys(&:to_sym)
            {
              id: item[:id]&.to_s || 'cutout',
              width_mm: Float(item[:width_mm] || 0.0),
              depth_mm: Float(item[:depth_mm] || 0.0),
              offset_x_mm: Float(item[:offset_x_mm] || 0.0),
              offset_y_mm: Float(item[:offset_y_mm] || 0.0),
              fixture_type: item[:fixture_type]&.to_s || 'sink'
            }.freeze
          end
        end
      end
    end
  end
end
