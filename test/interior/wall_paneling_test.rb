# frozen_string_literal: true

require_relative '../test_helper'

module JiraNot
  module ConstructFlow
    module Interior
      class WallPanelingTest < Minitest::Test
        def setup
          @runtime = build_test_runtime
          Registration.install(@runtime)
        end

        def test_slat_fluted_paneling_calculations
          # Wall 3000mm length, 2600mm height
          # Slat 35mm, gap 15mm -> pitch = 50mm
          # Slats count = 3000 / 50 = 60 slats
          wp = WallPanelingDefinition.new(
            wall_length_mm: 3000.0,
            wall_height_mm: 2600.0,
            style: 'slat_fluted',
            slat_width_mm: 35.0,
            slat_gap_mm: 15.0
          )

          assert wp.valid?
          assert wp.slat_fluted?
          assert_equal 50.0, wp.slat_pitch_mm
          assert_equal 60, wp.slats_count
          assert_in_delta 7.8, wp.gross_area_sqm, 0.01
          assert_in_delta 7.8, wp.covered_area_sqm, 0.01
        end

        def test_shaker_wainscoting_calculations
          # Wall 3600mm length, 2600mm height
          # Dado rail at 1000mm height
          wp = WallPanelingDefinition.new(
            wall_length_mm: 3600.0,
            wall_height_mm: 2600.0,
            style: 'shaker_wainscot',
            dado_rail_height_mm: 1000.0,
            divisions_count: 6
          )

          assert wp.valid?
          assert wp.wainscot?
          assert_equal 6, wp.panel_divisions
          assert_equal 600.0, wp.division_width_mm
          # Wainscot covered area is only 3.6m * 1.0m = 3.6 sqm (not the whole 9.36 sqm wall)
          assert_in_delta 3.6, wp.covered_area_sqm, 0.01
          assert_in_delta 9.36, wp.gross_area_sqm, 0.01
        end

        def test_create_wall_paneling_command
          res = @runtime.commands.execute('CreateWallPaneling', {
            wall_length_mm: 4000.0,
            wall_height_mm: 2800.0,
            style: 'slat_fluted',
            slat_width_mm: 30.0,
            slat_gap_mm: 10.0
          })

          assert_equal 'success', res[:status], res[:errors]
          wp_id = res[:created_object_ids].first
          assert wp_id

          obj = @runtime.smart_objects.fetch_by_id(wp_id)
          assert_equal 'interior.wall_paneling', obj.type

          repo = Repository.new
          wp_def = repo.read_wall_paneling(obj.entity)
          assert_equal 'slat_fluted', wp_def.style
          assert_equal 100, wp_def.slats_count # 4000 / 40 = 100 slats
        end
      end
    end
  end
end
