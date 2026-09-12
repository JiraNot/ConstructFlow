# frozen_string_literal: true

require_relative '../test_helper'

module JiraNot
  module ConstructFlow
    module Interior
      class FalseCeilingTest < Minitest::Test
        def setup
          @runtime = build_test_runtime
          Registration.install(@runtime)
        end

        def test_false_ceiling_definition_area_and_cove
          # 5m x 4m room ceiling = 20 sqm area, 18m perimeter
          ceiling = FalseCeilingDefinition.new(
            boundary_nodes_mm: [
              [0.0, 0.0, 0.0],
              [5000.0, 0.0, 0.0],
              [5000.0, 4000.0, 0.0],
              [0.0, 4000.0, 0.0]
            ],
            ceiling_type: 'cove_soffit',
            elevation_z_mm: 2700.0,
            perimeter_gap_mm: 15.0,
            cove_trough: { width_mm: 150.0, upstand_mm: 80.0, light_strip: true }
          )

          assert ceiling.valid?
          assert_in_delta 20.0, ceiling.area_sqm, 0.01
          assert_in_delta 18000.0, ceiling.perimeter_length_mm, 1.0
          assert ceiling.has_cove?
          assert_in_delta 18000.0, ceiling.cove_length_mm, 1.0
        end

        def test_create_false_ceiling_command
          res = @runtime.commands.execute('CreateFalseCeiling', {
            boundary_nodes_mm: [
              [0.0, 0.0, 0.0],
              [6000.0, 0.0, 0.0],
              [6000.0, 3000.0, 0.0],
              [0.0, 3000.0, 0.0]
            ],
            ceiling_type: 'flat_gypsum',
            elevation_z_mm: 2600.0,
            perimeter_gap_mm: 12.0
          })

          assert_equal 'success', res[:status], res[:errors]
          c_id = res[:created_object_ids].first
          assert c_id

          obj = @runtime.smart_objects.fetch_by_id(c_id)
          assert_equal 'interior.false_ceiling', obj.type

          repo = Repository.new
          c_def = repo.read_false_ceiling(obj.entity)
          assert_equal 'flat_gypsum', c_def.ceiling_type
          assert_in_delta 18.0, c_def.area_sqm, 0.01
        end
      end
    end
  end
end
