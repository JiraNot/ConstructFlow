# frozen_string_literal: true

require_relative '../test_helper'
require File.join(DRAINAGE, 'rainwater_downpipe_service')
require File.join(DRAINAGE, 'downpipe_endpoint_sync_service')

class DownpipeEndpointSyncServiceTest < Minitest::Test
  SmartStub = Struct.new(:id, :entity, :type, :owner_module, keyword_init: true)

  class SmartObjects
    attr_reader :dirty

    def initialize(objects)
      @objects = objects.each_with_object({}) { |object, result| result[object.id] = object }
      @dirty = []
    end

    def fetch_by_id(id) = @objects[id.to_s]

    def mark_dirty(entity, *flags)
      @dirty << [entity, flags]
    end
  end

  class FakeGeometry
    attr_reader :definitions

    def initialize
      @definitions = []
    end

    def rebuild_pipe!(entity, definition)
      @definitions << [entity, definition]
      entity
    end
  end

  Runtime = Struct.new(:connectors, :smart_objects, keyword_init: true)

  def setup
    @model = FakeModel.new
    @connectors = JiraNot::ConstructFlow::Core::ConnectorRegistry.new
    @connectors.attach_model(@model)
    @connectors.register_compatibility(
      'roof.gutter_outlet', 'drainage.manhole_in',
      system: 'drainage.rainwater'
    )
    @source = @connectors.register_connector(
      owner_object_id: 'gutter-1', type: 'roof.gutter_outlet', role: 'outlet',
      position_mm: [0, 0, 3000], properties: { gravity: true }
    )
    @target = @connectors.register_connector(
      owner_object_id: 'mh-1', type: 'drainage.manhole_in', role: 'inlet',
      position_mm: [1500, 0, 0], properties: { gravity: true }
    )
    @entity = FakeEntity.new
    @object = SmartStub.new(id: 'dp-1', entity: @entity, type: 'drainage.downpipe', owner_module: 'constructflow.drainage')
    @smart_objects = SmartObjects.new([@object])
    @repository = JiraNot::ConstructFlow::Drainage::Repository.new
    @geometry = FakeGeometry.new
    @runtime = Runtime.new(connectors: @connectors, smart_objects: @smart_objects)
  end

  def test_direct_downpipe_rebuilds_deterministically_from_moved_source_connector
    connection = @connectors.register_connection(
      from_connector_id: @source['id'], to_connector_id: @target['id'], system: 'drainage.rainwater',
      metadata: { route_object_id: @object.id, route_kind: 'downpipe' }
    )
    @repository.write_downpipe(
      @entity,
      JiraNot::ConstructFlow::Drainage::DownpipeDefinition.new(
        route_nodes_mm: [[0, 0, 3000], [0, 0, 0], [1500, 0, 0]],
        start_connector_id: @source['id'], end_connector_id: @target['id'],
        route_strategy: 'direct', connection_id: connection['id']
      )
    )
    @connectors.update_connector(@source['id'], position_mm: [500, 250, 3200])

    result = JiraNot::ConstructFlow::Drainage::DownpipeEndpointSyncService.new(
      runtime: @runtime, repository: @repository, geometry: @geometry
    ).sync_connector(connector_id: @source['id'])

    assert_equal ['dp-1'], result['updated_downpipe_ids']
    updated = @repository.read_downpipe(@entity)
    assert_equal [[500.0, 250.0, 3200.0], [500.0, 250.0, 0.0], [1500.0, 0.0, 0.0]], updated.route_nodes_mm
    assert_equal 1, @geometry.definitions.length
    assert @smart_objects.dirty.any? { |entity, flags| entity.equal?(@entity) && flags.include?('dirty_quantity') }
  end

  def test_explicit_downpipe_preserves_internal_control_nodes_while_reanchoring_endpoint
    connection = @connectors.register_connection(
      from_connector_id: @source['id'], to_connector_id: @target['id'], system: 'drainage.rainwater',
      metadata: { route_object_id: @object.id, route_kind: 'downpipe' }
    )
    @repository.write_downpipe(
      @entity,
      JiraNot::ConstructFlow::Drainage::DownpipeDefinition.new(
        route_nodes_mm: [[0, 0, 3000], [250, 0, 1500], [1500, 0, 0]],
        start_connector_id: @source['id'], end_connector_id: @target['id'],
        route_strategy: 'explicit', connection_id: connection['id']
      )
    )
    @connectors.update_connector(@source['id'], position_mm: [100, 100, 3100])

    JiraNot::ConstructFlow::Drainage::DownpipeEndpointSyncService.new(
      runtime: @runtime, repository: @repository, geometry: @geometry
    ).sync_connector(connector_id: @source['id'])

    updated = @repository.read_downpipe(@entity)
    assert_equal [100.0, 100.0, 3100.0], updated.route_nodes_mm.first
    assert_equal [250.0, 0.0, 1500.0], updated.route_nodes_mm[1]
    assert_equal [1500.0, 0.0, 0.0], updated.route_nodes_mm.last
  end
end
