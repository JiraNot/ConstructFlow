# frozen_string_literal: true

require_relative '../test_helper'
require File.join(DRAINAGE, 'rainwater_downpipe_registration')
require File.join(DRAINAGE, 'rainwater_downpipe_service')

module JiraNot
  module ConstructFlow
    module Drainage
      class DownpipeBridgeTest < Minitest::Test
        def setup
          @runtime = build_test_runtime
          Registration.install(@runtime)
          RainwaterDownpipeRegistration.install(@runtime)
        end

        def test_connect_downpipe_to_drainage_with_nearest_search
          # 1. Register a gutter outlet connector and a downpipe discharge connector
          gutter_conn = @runtime.connectors.register_connector(
            owner_object_id: 'roof_01',
            type: 'roof.gutter_outlet',
            role: 'source',
            position_mm: [1000.0, 1000.0, 3000.0]
          )
          dp_discharge_conn = @runtime.connectors.register_connector(
            owner_object_id: 'roof_01',
            type: 'drainage.rainwater',
            role: 'source',
            position_mm: [1000.0, 1000.0, 50.0]
          )

          # 2. Create downpipe
          dp_res = @runtime.commands.execute('CreateRainwaterDownpipe', {
            start_connector_id: gutter_conn['id'],
            end_connector_id: dp_discharge_conn['id'],
            diameter_mm: 80.0
          })
          downpipe_id = dp_res[:created_object_ids].first

          # 3. Register a manhole with an in-connector nearby at [1200, 2500, 0]
          manhole_conn = @runtime.connectors.register_connector(
            owner_object_id: 'mh_01',
            type: 'drainage.manhole_in',
            role: 'inlet',
            position_mm: [1200.0, 2500.0, -100.0]
          )

          # 4. Execute ConnectDownpipeToDrainage without explicit target (auto-finds nearest manhole/rainwater connector)
          bridge_res = @runtime.commands.execute('ConnectDownpipeToDrainage', {
            downpipe_id: downpipe_id
          })

          assert_equal 'success', bridge_res[:status], "Command failed: #{bridge_res[:errors]}"
          assert bridge_res[:created_object_ids]
          pipe_id = bridge_res[:created_object_ids].first
          assert pipe_id

          events = bridge_res[:events].map { |e| e[:name] }
          assert_includes events, 'DownpipeToDrainageConnected'
          assert_includes events, 'DrainageTopologyChanged'

          pipe_obj = @runtime.smart_objects.fetch_by_id(pipe_id)
          assert_equal 'drainage.pipe_route', pipe_obj.type

          repo = Repository.new
          pipe_def = repo.read_pipe_route(pipe_obj.entity)
          assert_equal 'rainwater', pipe_def.system
          assert_equal dp_discharge_conn['id'], pipe_def.start_connector_id
          assert_equal manhole_conn['id'], pipe_def.end_connector_id
        end
      end
    end
  end
end
