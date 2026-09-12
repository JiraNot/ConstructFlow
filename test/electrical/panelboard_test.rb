# frozen_string_literal: true

require_relative '../test_helper'

module JiraNot
  module ConstructFlow
    module Electrical
      class PanelboardTest < Minitest::Test
        def setup
          @runtime = build_test_runtime
          Registration.install(@runtime)
        end

        def test_single_phase_panelboard
          panel = PanelboardDefinition.new(
            id: 'LP-1',
            name: 'Lighting Panel 1',
            phase_config: '1P2W',
            main_breaker_a: 40.0,
            circuits: {
              1 => { description: 'Living Room Lights', rating_a: 16, load_va: 1200, phase: 'A' },
              2 => { description: 'Kitchen Lights', rating_a: 16, load_va: 800, phase: 'A' }
            }
          )

          assert panel.valid?
          assert_equal 2000.0, panel.total_load_va
          assert_equal 2000.0, panel.phase_loads_va['A']
          assert_equal 0.0, panel.unbalance_percent
          refute panel.main_breaker_overloaded?
        end

        def test_three_phase_panelboard_and_balancing
          # Unbalanced initial distribution: All high loads on Phase A
          circuits = {
            1 => { description: 'AC 1', rating_a: 20, load_va: 3500, phase: 'A' },
            2 => { description: 'AC 2', rating_a: 20, load_va: 3500, phase: 'A' },
            3 => { description: 'Water Heater', rating_a: 25, load_va: 4500, phase: 'A' },
            4 => { description: 'Lighting 1', rating_a: 16, load_va: 1000, phase: 'B' },
            5 => { description: 'Lighting 2', rating_a: 16, load_va: 1000, phase: 'C' }
          }

          unbalanced = PanelboardDefinition.new(
            id: 'MDP',
            name: 'Main Distribution Panel',
            phase_config: '3P4W',
            voltage_v: 400.0,
            main_breaker_a: 100.0,
            circuits: circuits
          )

          assert unbalanced.unbalance_percent > 50.0

          balanced = unbalanced.with_balanced_phases
          # After balancing, phases should be much closer
          assert balanced.unbalance_percent < unbalanced.unbalance_percent
          assert_equal unbalanced.total_load_va, balanced.total_load_va
        end

        def test_voltage_drop_calculator_compliance_and_upsizing
          calc = VoltageDropCalculator.new
          # Long run: 60 meters, 16 Amps at 230V with standard 2.5 sqmm wire
          # 2.5 sqmm has R ~ 8.91 ohm/km
          # VD = 2 * 60 * 16 * (8.91 / 1000) = 17.1V -> 7.43% (> 3% threshold!)
          res = calc.calculate(
            length_m: 60.0,
            current_a: 16.0,
            conductor_size_sqmm: 2.5,
            voltage_v: 230.0,
            phase_config: '1P2W'
          )

          refute res.compliant_branch, '7.4% voltage drop should exceed 3% branch limit'
          assert_operator res.recommended_conductor_size_sqmm, :>, 2.5

          # Verify recommended conductor achieves compliance
          rec_res = calc.calculate(
            length_m: 60.0,
            current_a: 16.0,
            conductor_size_sqmm: res.recommended_conductor_size_sqmm,
            voltage_v: 230.0,
            phase_config: '1P2W'
          )
          assert rec_res.compliant_branch, "Recommended size #{res.recommended_conductor_size_sqmm} must be compliant"
        end

        def test_panelboard_and_voltage_drop_commands
          # 1. Create panelboard
          create_res = @runtime.commands.execute('CreatePanelboard', {
            id: 'DB-1',
            name: 'Distribution Board 1',
            phase_config: '3P4W',
            voltage_v: 400.0,
            main_breaker_a: 63.0,
            circuits: {
              1 => { description: 'Cooker', load_va: 4000, phase: 'A' },
              2 => { description: 'Heater', load_va: 3500, phase: 'A' },
              3 => { description: 'Ring 1', load_va: 1500, phase: 'B' }
            }
          })
          assert_equal 'success', create_res[:status], create_res[:errors]

          # 2. Balance loads
          bal_res = @runtime.commands.execute('BalancePanelLoads', {
            panel_id: 'DB-1'
          })
          assert_equal 'success', bal_res[:status], bal_res[:errors]

          # 3. Calculate voltage drop
          vd_res = @runtime.commands.execute('CalculateVoltageDrop', {
            length_m: 30.0,
            current_a: 10.0,
            conductor_size_sqmm: 2.5,
            voltage_v: 230.0
          })
          assert_equal 'success', vd_res[:status], vd_res[:errors]
          event = vd_res[:events].find { |e| e[:name] == 'VoltageDropCalculated' }
          res = event[:payload]
          assert res['compliant_branch']
        end
      end
    end
  end
end
