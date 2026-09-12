# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      class WallPanelingDefinition
        SCHEMA_VERSION = 1
        STYLES = %w[slat_fluted shaker_wainscot beadboard boiserie].freeze

        attr_reader :id, :wall_length_mm, :wall_height_mm, :style,
                    :slat_width_mm, :slat_gap_mm, :slat_depth_mm,
                    :dado_rail_height_mm, :skirting_height_mm,
                    :stile_width_mm, :rail_width_mm, :divisions_count,
                    :backing_thickness_mm

        def initialize(id: nil, wall_length_mm:, wall_height_mm:, style: 'slat_fluted',
                       slat_width_mm: 35.0, slat_gap_mm: 15.0, slat_depth_mm: 15.0,
                       dado_rail_height_mm: 1000.0, skirting_height_mm: 100.0,
                       stile_width_mm: 90.0, rail_width_mm: 90.0, divisions_count: nil,
                       backing_thickness_mm: 9.0)
          @id = id&.to_s
          @wall_length_mm = Float(wall_length_mm)
          @wall_height_mm = Float(wall_height_mm)
          @style = style.to_s
          @slat_width_mm = Float(slat_width_mm)
          @slat_gap_mm = Float(slat_gap_mm)
          @slat_depth_mm = Float(slat_depth_mm)
          @dado_rail_height_mm = Float(dado_rail_height_mm)
          @skirting_height_mm = Float(skirting_height_mm)
          @stile_width_mm = Float(stile_width_mm)
          @rail_width_mm = Float(rail_width_mm)
          @divisions_count = divisions_count ? Integer(divisions_count) : nil
          @backing_thickness_mm = Float(backing_thickness_mm)
          freeze
        end

        def errors
          result = []
          result << 'wall length must be positive' unless wall_length_mm.positive?
          result << 'wall height must be positive' unless wall_height_mm.positive?
          result << 'unsupported paneling style' unless STYLES.include?(style)
          if slat_fluted?
            result << 'slat width must be positive' unless slat_width_mm.positive?
            result << 'slat gap cannot be negative' if slat_gap_mm.negative?
          elsif wainscot?
            result << 'dado rail height must be positive and <= wall height' if dado_rail_height_mm <= 0 || dado_rail_height_mm > wall_height_mm
          end
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def slat_fluted?
          style == 'slat_fluted'
        end

        def wainscot?
          %w[shaker_wainscot beadboard boiserie].include?(style)
        end

        def slat_pitch_mm
          slat_width_mm + slat_gap_mm
        end

        def slats_count
          return 0 unless slat_fluted?
          return 0 if slat_pitch_mm <= 0.001

          (wall_length_mm / slat_pitch_mm).floor
        end

        def panel_divisions
          return 0 unless wainscot?

          divisions_count || [(wall_length_mm / 600.0).round, 1].max
        end

        def division_width_mm
          return 0.0 unless wainscot?

          divs = panel_divisions
          return 0.0 if divs.zero?

          wall_length_mm / divs
        end

        def gross_area_sqm
          (wall_length_mm * wall_height_mm) / 1_000_000.0
        end

        def covered_area_sqm
          if wainscot?
            (wall_length_mm * dado_rail_height_mm) / 1_000_000.0
          else
            gross_area_sqm
          end
        end

        def with(**changes)
          self.class.new(
            id: changes.fetch(:id, id),
            wall_length_mm: changes.fetch(:wall_length_mm, wall_length_mm),
            wall_height_mm: changes.fetch(:wall_height_mm, wall_height_mm),
            style: changes.fetch(:style, style),
            slat_width_mm: changes.fetch(:slat_width_mm, slat_width_mm),
            slat_gap_mm: changes.fetch(:slat_gap_mm, slat_gap_mm),
            slat_depth_mm: changes.fetch(:slat_depth_mm, slat_depth_mm),
            dado_rail_height_mm: changes.fetch(:dado_rail_height_mm, dado_rail_height_mm),
            skirting_height_mm: changes.fetch(:skirting_height_mm, skirting_height_mm),
            stile_width_mm: changes.fetch(:stile_width_mm, stile_width_mm),
            rail_width_mm: changes.fetch(:rail_width_mm, rail_width_mm),
            divisions_count: changes.fetch(:divisions_count, divisions_count),
            backing_thickness_mm: changes.fetch(:backing_thickness_mm, backing_thickness_mm)
          )
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'id' => id,
            'wall_length_mm' => wall_length_mm,
            'wall_height_mm' => wall_height_mm,
            'style' => style,
            'slat_width_mm' => slat_width_mm,
            'slat_gap_mm' => slat_gap_mm,
            'slat_depth_mm' => slat_depth_mm,
            'slat_pitch_mm' => slat_pitch_mm,
            'slats_count' => slats_count,
            'dado_rail_height_mm' => dado_rail_height_mm,
            'skirting_height_mm' => skirting_height_mm,
            'stile_width_mm' => stile_width_mm,
            'rail_width_mm' => rail_width_mm,
            'panel_divisions' => panel_divisions,
            'division_width_mm' => division_width_mm.round(1),
            'gross_area_sqm' => gross_area_sqm.round(3),
            'covered_area_sqm' => covered_area_sqm.round(3)
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            id: data['id'] || data[:id],
            wall_length_mm: data['wall_length_mm'] || data[:wall_length_mm] || 3000.0,
            wall_height_mm: data['wall_height_mm'] || data[:wall_height_mm] || 2600.0,
            style: data['style'] || data[:style] || 'slat_fluted',
            slat_width_mm: data['slat_width_mm'] || data[:slat_width_mm] || 35.0,
            slat_gap_mm: data['slat_gap_mm'] || data[:slat_gap_mm] || 15.0,
            slat_depth_mm: data['slat_depth_mm'] || data[:slat_depth_mm] || 15.0,
            dado_rail_height_mm: data['dado_rail_height_mm'] || data[:dado_rail_height_mm] || 1000.0,
            skirting_height_mm: data['skirting_height_mm'] || data[:skirting_height_mm] || 100.0,
            stile_width_mm: data['stile_width_mm'] || data[:stile_width_mm] || 90.0,
            rail_width_mm: data['rail_width_mm'] || data[:rail_width_mm] || 90.0,
            divisions_count: data['divisions_count'] || data[:divisions_count],
            backing_thickness_mm: data['backing_thickness_mm'] || data[:backing_thickness_mm] || 9.0
          )
        end
      end
    end
  end
end
