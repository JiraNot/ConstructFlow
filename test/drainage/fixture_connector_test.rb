# frozen_string_literal: true

require_relative '../test_helper'

module JiraNot
  module ConstructFlow
    module Drainage
      class FixtureConnectorTest < Minitest::Test
        def test_fixture_connector_definition_validity
          fc = FixtureConnectorDefinition.new(
            fixture_id: 'toilet_01',
            fixture_type: 'toilet',
            connector_type: 'soil_waste',
            position_mm: [0.0, -100.0, 180.0],
            nominal_diameter_mm: 100.0,
            flow_rate_lps: 1.8,
            invert_mm: 180.0,
            direction_vector: [0.0, -1.0, 0.0]
          )
          assert fc.valid?
          assert_empty fc.errors
          assert_equal 'toilet', fc.fixture_type
          assert_equal 'soil_waste', fc.connector_type
          assert_equal 100.0, fc.nominal_diameter_mm
          assert_equal 1.8, fc.flow_rate_lps
          assert fc.waste_system?
          refute fc.water_supply?
        end

        def test_fixture_connector_validation_errors
          fc = FixtureConnectorDefinition.new(
            fixture_id: '',
            fixture_type: 'unknown_type',
            connector_type: 'invalid_conn',
            position_mm: [0, 0, 0],
            nominal_diameter_mm: -10.0,
            flow_rate_lps: -1.0
          )
          refute fc.valid?
          assert fc.errors.any? { |e| e.include?('fixture id required') }
          assert fc.errors.any? { |e| e.include?('unsupported fixture type') }
          assert fc.errors.any? { |e| e.include?('unsupported connector type') }
          assert fc.errors.any? { |e| e.include?('nominal diameter must be positive') }
          assert fc.errors.any? { |e| e.include?('flow rate cannot be negative') }
        end

        def test_fixture_connector_registry_templates
          registry = FixtureConnectorRegistry.new
          templates = registry.supported_fixture_types
          assert_includes templates, 'toilet'
          assert_includes templates, 'basin'
          assert_includes templates, 'kitchen_sink'
          assert_includes templates, 'shower'
          assert_includes templates, 'floor_waste'
          assert_includes templates, 'washing_machine'

          toilet_conns = registry.template_for('toilet')
          assert_equal 2, toilet_conns.length # soil_waste + cold_water
          soil = toilet_conns.find { |c| c[:connector_type] == 'soil_waste' }
          assert_equal 100.0, soil[:nominal_diameter_mm]
        end

        def test_fixture_connector_instantiation_with_translation_and_rotation
          registry = FixtureConnectorRegistry.new
          # Basin at [1000, 2000, 850], rotation 90 deg counter-clockwise
          instances = registry.instantiate(
            fixture_id: 'basin_01',
            fixture_type: 'basin',
            origin_mm: [1000.0, 2000.0, 0.0],
            angle_deg: 90.0
          )
          assert_equal 3, instances.length # waste, cold, hot

          waste = instances.find { |c| c.connector_type == 'waste' }
          assert waste
          assert_equal 'basin_01', waste.fixture_id
          assert_equal 'basin', waste.fixture_type
          # Local was [0, -50, 550]. At 90 deg: x' = 0 - (-50)*1 = 50, y' = 0 + 0 = 0
          # World = [1000 + 50, 2000 + 0, 550] = [1050, 2000, 550]
          assert_in_delta 1050.0, waste.position_mm[0], 1.0
          assert_in_delta 2000.0, waste.position_mm[1], 1.0
          assert_in_delta 550.0, waste.position_mm[2], 1.0
        end

        def test_serialization_round_trip
          fc = FixtureConnectorDefinition.new(
            fixture_id: 'shower_01',
            fixture_type: 'shower',
            connector_type: 'waste',
            position_mm: [450.0, 450.0, 0.0],
            nominal_diameter_mm: 50.0,
            flow_rate_lps: 0.8,
            direction_vector: [0.0, 0.0, -1.0]
          )
          hash = fc.to_h
          restored = FixtureConnectorDefinition.from_h(hash)
          assert_equal fc.fixture_id, restored.fixture_id
          assert_equal fc.fixture_type, restored.fixture_type
          assert_equal fc.connector_type, restored.connector_type
          assert_equal fc.nominal_diameter_mm, restored.nominal_diameter_mm
          assert_equal fc.flow_rate_lps, restored.flow_rate_lps
          assert_equal fc.direction_vector, restored.direction_vector
        end
      end
    end
  end
end
