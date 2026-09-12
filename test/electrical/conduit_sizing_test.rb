# frozen_string_literal: true

require_relative '../test_helper'

module JiraNot
  module ConstructFlow
    module Electrical
      class ConduitSizingTest < Minitest::Test
        def setup
          @runtime = build_test_runtime
          Registration.install(@runtime)
          @engine = ConduitSizingEngine.new
        end

        def test_cable_definition_properties
          cable = CableDefinition.new(
            conductor_size_sqmm: 2.5,
            conductor_count: 1,
            insulation_type: 'thw'
          )
          assert cable.valid?
          assert_equal 3.9, cable.outer_diameter_mm
          assert_in_delta 11.95, cable.cross_section_area_sqmm, 0.1
          assert_equal 8.91, cable.resistance_ohm_per_km
        end

        def test_one_conductor_53_percent_fill
          cable = CableDefinition.new(conductor_size_sqmm: 16.0, insulation_type: 'thw') # OD 7.8mm, Area ~47.8 sqmm
          res = @engine.calculate_size(cables: [cable], conduit_type: 'emt')

          assert res.compliant
          assert_equal 53.0, res.max_allowed_fill_percentage
          assert_operator res.fill_percentage, :<=, 53.0
          assert_equal 15.0, res.conduit_size_mm # 15mm EMT has 196 sqmm area, 47.8 / 196 = 24.4% <= 53%
        end

        def test_two_conductors_31_percent_fill
          c1 = CableDefinition.new(conductor_size_sqmm: 2.5, insulation_type: 'thw')
          c2 = CableDefinition.new(conductor_size_sqmm: 2.5, insulation_type: 'thw')
          res = @engine.calculate_size(cables: [c1, c2], conduit_type: 'emt')

          assert res.compliant
          assert_equal 31.0, res.max_allowed_fill_percentage
          assert_operator res.fill_percentage, :<=, 31.0
        end

        def test_three_or_more_conductors_40_percent_fill
          # Three 4.0 sqmm THW cables: OD 4.6mm, area each ~16.6 sqmm, total ~49.8 sqmm
          cables = Array.new(3) { CableDefinition.new(conductor_size_sqmm: 4.0, insulation_type: 'thw') }
          res = @engine.calculate_size(cables: cables, conduit_type: 'emt')

          assert res.compliant
          assert_equal 40.0, res.max_allowed_fill_percentage
          assert_operator res.fill_percentage, :<=, 40.0
          assert_equal 15.0, res.conduit_size_mm
        end

        def test_bundle_sizing_picks_larger_conduit
          # 10 cables of 6.0 sqmm THW
          cables = Array.new(10) { CableDefinition.new(conductor_size_sqmm: 6.0, insulation_type: 'thw') }
          res = @engine.calculate_size(cables: cables, conduit_type: 'emt')

          assert res.compliant
          assert_operator res.conduit_size_mm, :>=, 25.0
          assert_operator res.fill_percentage, :<=, 40.0
        end

        def test_calculate_conduit_size_command
          cmd_res = @runtime.commands.execute('CalculateConduitSize', {
            cables: [
              { conductor_size_sqmm: 2.5, quantity: 4, insulation_type: 'thw' }
            ],
            conduit_type: 'emt'
          })

          assert_equal 'success', cmd_res[:status], cmd_res[:errors]
          event = cmd_res[:events].find { |e| e[:name] == 'ConduitSized' }
          res = event[:payload]
          assert res['compliant']
          assert_equal 40.0, res['max_allowed_fill_percentage']
          assert_operator res['conduit_size_mm'], :>, 0
        end
      end
    end
  end
end
