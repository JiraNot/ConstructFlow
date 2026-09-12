# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class FixtureConnectorRegistry
        def initialize
          @templates = {}
          register_default_templates
        end

        def register_template(fixture_type, template_connectors)
          @templates[fixture_type.to_s] = Array(template_connectors).freeze
        end

        def template_for(fixture_type)
          @templates[fixture_type.to_s] || []
        end

        def supported_fixture_types
          @templates.keys.sort
        end

        def instantiate(fixture_id:, fixture_type:, origin_mm: [0, 0, 0], angle_deg: 0.0)
          templates = template_for(fixture_type)
          raise ArgumentError, "unknown fixture type: #{fixture_type}" if templates.empty?

          ox, oy, oz = Float(origin_mm[0] || 0.0), Float(origin_mm[1] || 0.0), Float(origin_mm[2] || 0.0)
          rad = Float(angle_deg || 0.0) * Math::PI / 180.0
          cos_a = Math.cos(rad)
          sin_a = Math.sin(rad)

          templates.map do |tpl|
            lx, ly, lz = tpl[:position_mm]
            # Rotate in XY and translate
            wx = ox + (lx * cos_a) - (ly * sin_a)
            wy = oy + (lx * sin_a) + (ly * cos_a)
            wz = oz + lz

            dir = tpl[:direction_vector] || [0.0, 0.0, -1.0]
            w_dir_x = (dir[0] * cos_a) - (dir[1] * sin_a)
            w_dir_y = (dir[0] * sin_a) + (dir[1] * cos_a)
            w_dir_z = dir[2]

            FixtureConnectorDefinition.new(
              fixture_id: fixture_id,
              fixture_type: fixture_type,
              connector_type: tpl[:connector_type],
              position_mm: [wx, wy, wz],
              nominal_diameter_mm: tpl[:nominal_diameter_mm],
              flow_rate_lps: tpl[:flow_rate_lps],
              invert_mm: wz,
              direction_vector: [w_dir_x, w_dir_y, w_dir_z]
            )
          end
        end

        private

        def register_default_templates
          register_template('toilet', [
            { connector_type: 'soil_waste', position_mm: [0.0, -100.0, 180.0], nominal_diameter_mm: 100.0, flow_rate_lps: 1.8, direction_vector: [0.0, -1.0, 0.0] },
            { connector_type: 'cold_water', position_mm: [150.0, -50.0, 200.0], nominal_diameter_mm: 15.0, flow_rate_lps: 0.2, direction_vector: [0.0, 1.0, 0.0] }
          ])

          register_template('basin', [
            { connector_type: 'waste', position_mm: [0.0, -50.0, 550.0], nominal_diameter_mm: 40.0, flow_rate_lps: 0.6, direction_vector: [0.0, -1.0, 0.0] },
            { connector_type: 'cold_water', position_mm: [-100.0, -50.0, 600.0], nominal_diameter_mm: 15.0, flow_rate_lps: 0.15, direction_vector: [0.0, 0.0, 1.0] },
            { connector_type: 'hot_water', position_mm: [100.0, -50.0, 600.0], nominal_diameter_mm: 15.0, flow_rate_lps: 0.15, direction_vector: [0.0, 0.0, 1.0] }
          ])

          register_template('kitchen_sink', [
            { connector_type: 'waste', position_mm: [0.0, -50.0, 450.0], nominal_diameter_mm: 50.0, flow_rate_lps: 0.8, direction_vector: [0.0, -1.0, 0.0] },
            { connector_type: 'cold_water', position_mm: [-100.0, -50.0, 500.0], nominal_diameter_mm: 15.0, flow_rate_lps: 0.2, direction_vector: [0.0, 0.0, 1.0] },
            { connector_type: 'hot_water', position_mm: [100.0, -50.0, 500.0], nominal_diameter_mm: 15.0, flow_rate_lps: 0.2, direction_vector: [0.0, 0.0, 1.0] }
          ])

          register_template('shower', [
            { connector_type: 'waste', position_mm: [0.0, 0.0, 0.0], nominal_diameter_mm: 50.0, flow_rate_lps: 0.8, direction_vector: [0.0, 0.0, -1.0] },
            { connector_type: 'cold_water', position_mm: [-75.0, 0.0, 1000.0], nominal_diameter_mm: 15.0, flow_rate_lps: 0.2, direction_vector: [0.0, 1.0, 0.0] },
            { connector_type: 'hot_water', position_mm: [75.0, 0.0, 1000.0], nominal_diameter_mm: 15.0, flow_rate_lps: 0.2, direction_vector: [0.0, 1.0, 0.0] }
          ])

          register_template('floor_waste', [
            { connector_type: 'waste', position_mm: [0.0, 0.0, 0.0], nominal_diameter_mm: 50.0, flow_rate_lps: 0.5, direction_vector: [0.0, 0.0, -1.0] }
          ])

          register_template('washing_machine', [
            { connector_type: 'waste', position_mm: [0.0, 0.0, 800.0], nominal_diameter_mm: 50.0, flow_rate_lps: 0.8, direction_vector: [0.0, 0.0, -1.0] },
            { connector_type: 'cold_water', position_mm: [-100.0, 0.0, 900.0], nominal_diameter_mm: 20.0, flow_rate_lps: 0.3, direction_vector: [0.0, 1.0, 0.0] }
          ])

          register_template('bathtub', [
            { connector_type: 'waste', position_mm: [0.0, 0.0, 0.0], nominal_diameter_mm: 50.0, flow_rate_lps: 0.8, direction_vector: [0.0, 0.0, -1.0] },
            { connector_type: 'cold_water', position_mm: [-100.0, 0.0, 600.0], nominal_diameter_mm: 15.0, flow_rate_lps: 0.25, direction_vector: [0.0, 1.0, 0.0] },
            { connector_type: 'hot_water', position_mm: [100.0, 0.0, 600.0], nominal_diameter_mm: 15.0, flow_rate_lps: 0.25, direction_vector: [0.0, 1.0, 0.0] }
          ])

          register_template('urinal', [
            { connector_type: 'waste', position_mm: [0.0, -50.0, 350.0], nominal_diameter_mm: 50.0, flow_rate_lps: 0.6, direction_vector: [0.0, -1.0, 0.0] },
            { connector_type: 'cold_water', position_mm: [0.0, -50.0, 1000.0], nominal_diameter_mm: 15.0, flow_rate_lps: 0.15, direction_vector: [0.0, 1.0, 0.0] }
          ])
        end
      end
    end
  end
end
