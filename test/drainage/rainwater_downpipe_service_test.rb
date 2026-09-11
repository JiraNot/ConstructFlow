# frozen_string_literal: true

require_relative '../test_helper'
require File.join(DRAINAGE, 'downpipe_definition')
require File.join(DRAINAGE, 'rainwater_downpipe_service')

class RainwaterDownpipeServiceTest < Minitest::Test
  SmartStub = Struct.new(:id, :entity, :type, :owner_module, :source_state, keyword_init: true)

  class Group < FakeEntity
    attr_accessor :name
  end

  class FakeGeometry
    attr_reader :definitions, :rebuilt

    def initialize
      @definitions = []
      @rebuilt = []
    end

    def create_pipe_group(_model, definition)
      @definitions << definition
      Group.new
    end

    def rebuild_pipe!(entity, definition)
      @rebuilt << [entity, definition]
      entity
    end
  end

  class SmartObjects
    attr_reader :relationships, :dirty

    def initialize
      @counter = 0
      @objects = {}
      @relationships = []
      @dirty = []
      @objects['ext-1'] = SmartStub.new(id: 'ext-1', entity: FakeEntity.new, type: 'extension.zone', owner_module: 'constructflow.extension', source_state: 'confirmed')
    end

    def create(entity:, type:, owner_module:, display_name:, created_phase:, source_state:)
      @counter += 1
      object = SmartStub.new(id: "dp-#{@counter}", entity: entity, type: type, owner_module: owner_module, source_state: source_state)
      @objects[object.id] = object
      object
    end

    def add_relationship(entity, kind:, target_id:, role:, metadata: {})
      @relationships << [entity, kind, target_id, role, metadata]
    end

    def mark_dirty(entity, *flags)
      @dirty << [entity, flags]
    end

    def fetch_by_id(id)
      @objects[id.to_s]
    end
  end

  Runtime = Struct.new(:active_model, :connectors, :smart_objects, keyword_init: true)

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
    @smart_objects = SmartObjects.new
    @geometry = FakeGeometry.new
    @runtime = Runtime.new(active_model: @model, connectors: @connectors, smart_objects: @smart_objects)
  end

  def test_creates_vertical_drop_plus_explicit_plan_leg_and_network_connection
    service = JiraNot::ConstructFlow::Drainage::RainwaterDownpipeService.new(
      runtime: @runtime,
      geometry: @geometry
    )
    result = service.create(
      start_connector_id: @source['id'],
      end_connector_id: @target['id'],
      generated_from_id: 'ext-1'
    )

    definition = result[:definition]
    assert_equal [[0.0, 0.0, 3000.0], [0.0, 0.0, 0.0], [1500.0, 0.0, 0.0]], definition.route_nodes_mm
    assert_equal 'drainage.rainwater', result[:connection]['system']
    assert_equal 'drainage.downpipe', result[:object].type
    assert_equal 'connected', @connectors.connector(@source['id'])['state']
    assert @smart_objects.relationships.any? { |_entity, kind, target, role, _meta| kind == 'connects_to' && target == 'gutter-1' && role == 'rainwater_source' }
    assert @smart_objects.relationships.any? { |_entity, kind, target, role, _meta| kind == 'connects_to' && target == 'mh-1' && role == 'rainwater_destination' }
    assert @smart_objects.relationships.any? { |_entity, kind, target, role, _meta| kind == 'generated_from' && target == 'ext-1' && role == 'extension_source' }
  end

  def test_rejects_second_downpipe_on_same_gutter_outlet
    service = JiraNot::ConstructFlow::Drainage::RainwaterDownpipeService.new(runtime: @runtime, geometry: @geometry)
    service.create(start_connector_id: @source['id'], end_connector_id: @target['id'])

    error = assert_raises(ArgumentError) do
      service.create(start_connector_id: @source['id'], end_connector_id: @target['id'])
    end
    assert_includes error.message, 'already has an active rainwater connection'
  end

  def test_refresh_preserves_downpipe_and_connection_identity_for_direct_route
    repository = JiraNot::ConstructFlow::Drainage::Repository.new
    service = JiraNot::ConstructFlow::Drainage::RainwaterDownpipeService.new(
      runtime: @runtime, repository: repository, geometry: @geometry
    )
    created = service.create(start_connector_id: @source['id'], end_connector_id: @target['id'])
    object = created[:object]
    connection_id = created[:connection]['id']

    @connectors.update_connector(@source['id'], position_mm: [500, 0, 3200])
    refreshed = service.refresh_for_start_connector(start_connector_id: @source['id'])
    definition = repository.read_downpipe(object.entity)

    assert_equal [object.id], refreshed[:updated_object_ids]
    assert_equal connection_id, definition.connection_id
    assert_equal [[500.0, 0.0, 3200.0], [500.0, 0.0, 0.0], [1500.0, 0.0, 0.0]], definition.route_nodes_mm
    assert_equal 1, @geometry.rebuilt.length
    assert_equal object.entity, @geometry.rebuilt.first[0]
  end

  def test_refresh_reanchors_custom_route_endpoints_but_keeps_interior_nodes
    repository = JiraNot::ConstructFlow::Drainage::Repository.new
    service = JiraNot::ConstructFlow::Drainage::RainwaterDownpipeService.new(
      runtime: @runtime, repository: repository, geometry: @geometry
    )
    created = service.create(
      start_connector_id: @source['id'],
      end_connector_id: @target['id'],
      route_nodes_mm: [[0, 0, 3000], [700, 250, 1400], [1500, 0, 0]],
      route_strategy: 'manual'
    )

    @connectors.update_connector(@source['id'], position_mm: [100, 50, 3200])
    @connectors.update_connector(@target['id'], position_mm: [1600, 200, 100])
    service.refresh_for_start_connector(start_connector_id: @source['id'])
    definition = repository.read_downpipe(created[:object].entity)

    assert_equal [100.0, 50.0, 3200.0], definition.route_nodes_mm.first
    assert_equal [700.0, 250.0, 1400.0], definition.route_nodes_mm[1]
    assert_equal [1600.0, 200.0, 100.0], definition.route_nodes_mm.last
    assert_equal created[:connection]['id'], definition.connection_id
  end
end
