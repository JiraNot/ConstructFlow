# frozen_string_literal: true

require_relative '../test_helper'

module JiraNot
  module ConstructFlow
    module Interior
      class CountertopTest < Minitest::Test
        def setup
          @runtime = build_test_runtime
          Registration.install(@runtime)
        end

        def test_countertop_definition_area_and_overhangs
          # Base run is 2400 x 600 mm
          # Overhangs: front 25mm, back 0, left 15mm, right 15mm
          # Effective: (2400 + 30) = 2430mm, (600 + 25) = 625mm
          # Gross area: 2.43 * 0.625 = 1.51875 sqm
          ct = CountertopDefinition.new(
            length_mm: 2400.0,
            depth_mm: 600.0,
            thickness_mm: 20.0,
            front_overhang_mm: 25.0,
            left_overhang_mm: 15.0,
            right_overhang_mm: 15.0,
            material_id: 'quartz',
            splashback_height_mm: 100.0,
            waterfall_left: true,
            waterfall_height_mm: 850.0,
            cutouts: [
              { id: 'sink', width_mm: 600.0, depth_mm: 450.0, offset_x_mm: 500.0, offset_y_mm: 100.0 }
            ]
          )

          assert ct.valid?
          assert_equal 2430.0, ct.effective_length_mm
          assert_equal 625.0, ct.effective_depth_mm
          assert_in_delta 1.5188, ct.gross_area_sqm, 0.001

          # Sink cutout: 0.6 * 0.45 = 0.27 sqm
          assert_in_delta 0.27, ct.cutouts_area_sqm, 0.001
          assert_in_delta 1.2488, ct.net_area_sqm, 0.001

          # Waterfall left: 0.625 * 0.85 = 0.53125 sqm
          assert_in_delta 0.5313, ct.waterfall_area_sqm, 0.001

          # Splashback: 2.43 * 0.1 = 0.243 sqm
          assert_in_delta 0.243, ct.splashback_area_sqm, 0.001

          # Total stone required
          assert_in_delta 2.023, ct.total_stone_area_sqm, 0.005
        end

        def test_create_countertop_command
          res = @runtime.commands.execute('CreateCountertop', {
            length_mm: 1800.0,
            depth_mm: 600.0,
            material_id: 'granite',
            front_overhang_mm: 30.0,
            waterfall_right: true
          })

          assert_equal 'success', res[:status], res[:errors]
          ct_id = res[:created_object_ids].first
          assert ct_id

          obj = @runtime.smart_objects.fetch_by_id(ct_id)
          assert_equal 'interior.countertop', obj.type

          repo = Repository.new
          ct_def = repo.read_countertop(obj.entity)
          assert_equal 'granite', ct_def.material_id
          assert ct_def.waterfall_right
          assert_in_delta 1830.0, ct_def.effective_length_mm, 1.0
        end
      end
    end
  end
end
