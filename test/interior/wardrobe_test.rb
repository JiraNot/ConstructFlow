# frozen_string_literal: true

require_relative '../test_helper'

module JiraNot
  module ConstructFlow
    module Interior
      class WardrobeTest < Minitest::Test
        def setup
          @runtime = build_test_runtime
          Registration.install(@runtime)
        end

        def test_hinged_door_wardrobe_and_clearance
          # 2000mm wide wardrobe, hinged doors -> 4 panels (500mm each)
          w = WardrobeDefinition.new(
            width_mm: 2000.0,
            height_mm: 2400.0,
            depth_mm: 600.0,
            door_type: 'hinged',
            plinth_height_mm: 80.0
          )

          assert w.valid?
          assert_equal 4, w.door_panel_count
          assert_equal 500.0, w.swing_clearance_depth_mm
          assert_equal 582.0, w.internal_depth_mm # 600 - 18 = 582mm
          assert_equal 2320.0, w.usable_height_mm
        end

        def test_sliding_door_wardrobe_and_setback
          # 2400mm wide wardrobe, sliding doors -> 3 panels
          w = WardrobeDefinition.new(
            width_mm: 2400.0,
            height_mm: 2400.0,
            depth_mm: 650.0,
            door_type: 'sliding',
            sliding_track_setback_mm: 90.0
          )

          assert w.valid?
          assert_equal 3, w.door_panel_count
          assert_equal 0.0, w.swing_clearance_depth_mm # No swing into room!
          assert_equal 560.0, w.internal_depth_mm # 650 - 90 = 560mm
        end

        def test_create_wardrobe_command
          res = @runtime.commands.execute('CreateWardrobe', {
            width_mm: 1800.0,
            height_mm: 2200.0,
            depth_mm: 600.0,
            door_type: 'sliding'
          })

          assert_equal 'success', res[:status], res[:errors]
          w_id = res[:created_object_ids].first
          assert w_id

          obj = @runtime.smart_objects.fetch_by_id(w_id)
          assert_equal 'interior.wardrobe', obj.type

          repo = Repository.new
          w_def = repo.read_wardrobe(obj.entity)
          assert_equal 'sliding', w_def.door_type
          assert_equal 1800.0, w_def.width_mm
          assert_operator w_def.estimated_hanger_capacity, :>, 0
        end
      end
    end
  end
end
