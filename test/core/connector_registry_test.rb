# frozen_string_literal: true

require_relative '../test_helper'

class ConnectorRegistryTest < Minitest::Test
  def setup
    @model = FakeModel.new
    @registry = JiraNot::ConstructFlow::Core::ConnectorRegistry.new.attach_model(@model)
    @registry.register_compatibility('drainage.waste', 'drainage.manhole_in')
  end

  def test_connectors_and_connections_persist_on_model
    source = @registry.register_connector(
      owner_object_id: 'cf_sink',
      type: 'drainage.waste',
      role: 'outlet',
      nominal_size_mm: 50,
      position_mm: [0, 0, -300]
    )
    target = @registry.register_connector(
      owner_object_id: 'cf_mh',
      type: 'drainage.manhole_in',
      role: 'inlet',
      nominal_size_mm: 100,
      position_mm: [5000, 0, -400]
    )

    connection = @registry.register_connection(
      from_connector_id: source['id'],
      to_connector_id: target['id'],
      system: 'drainage.waste',
      metadata: { route_object_id: 'cf_route' }
    )

    assert_equal 2, @registry.connector_count
    assert_equal 1, @registry.connection_count
    assert_equal 'connected', @registry.connector(source['id'])['state']
    assert_equal 'connected', @registry.connector(target['id'])['state']
    assert_equal 'cf_route', @registry.connection_for_route('cf_route')['metadata']['route_object_id']

    reopened = JiraNot::ConstructFlow::Core::ConnectorRegistry.new.attach_model(@model)
    reopened.register_compatibility('drainage.waste', 'drainage.manhole_in')
    assert_equal connection['id'], reopened.connection(connection['id'])['id']
    assert_equal 2, reopened.connector_count
    assert_equal 1, reopened.connection_count
  end

  def test_replace_endpoint_preserves_connection_identity
    source = @registry.register_connector(
      owner_object_id: 'cf_sink', type: 'drainage.waste', role: 'outlet'
    )
    old_target = @registry.register_connector(
      owner_object_id: 'cf_old_mh', type: 'drainage.manhole_in', role: 'inlet'
    )
    new_target = @registry.register_connector(
      owner_object_id: 'cf_new_mh', type: 'drainage.manhole_in', role: 'inlet'
    )
    connection = @registry.register_connection(
      from_connector_id: source['id'],
      to_connector_id: old_target['id'],
      system: 'drainage.waste'
    )

    updated = @registry.replace_endpoint(
      connection['id'],
      old_connector_id: old_target['id'],
      new_connector_id: new_target['id']
    )

    assert_equal connection['id'], updated['id']
    assert_equal new_target['id'], updated['to_connector_id']
    assert_equal 'available', @registry.connector(old_target['id'])['state']
    assert_equal 'connected', @registry.connector(new_target['id'])['state']
  end

  def test_incompatible_connection_is_rejected
    source = @registry.register_connector(
      owner_object_id: 'cf_sink', type: 'drainage.waste', role: 'outlet'
    )
    power = @registry.register_connector(
      owner_object_id: 'cf_outlet', type: 'electrical.power', role: 'supply'
    )

    error = assert_raises(ArgumentError) do
      @registry.register_connection(
        from_connector_id: source['id'],
        to_connector_id: power['id'],
        system: 'drainage.waste'
      )
    end
    assert_match(/incompatible connectors/, error.message)
  end
end
