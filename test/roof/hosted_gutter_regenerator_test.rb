# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOF, 'hosted_gutter_regenerator')

class HostedGutterRegeneratorTest < Minitest::Test
  ObjectStub = Struct.new(:id, :type, :owner_module, :entity, keyword_init: true)

  class SmartObjects
    attr_reader :dirty

    def initialize(objects)
      @objects = objects
      @dirty = []
    end

    def all
      @objects
    end

    def mark_dirty(entity, *flags)
      @dirty << [entity, flags]
    end
  end

  class GutterGeometry
    attr_reader :rebuilt

    def initialize
      @rebuilt = []
    end

    def rebuild_gutter!(entity, roof_object:, definition:, edge_capability:)
      edge_capability.edge_points_mm(roof_object, definition.edge_index)
      @rebuilt << [entity, roof_object.id, definition.edge_index]
      entity
    end
  end

  class DownpipeProvider
    attr_reader :calls

    def initialize(ids = ['dp-1'])
      @ids = ids
      @calls = []
    end

    def refresh_for_start_connector(start_connector_id:)
      @calls << start_connector_id
      { updated_object_ids: @ids }
    end
  end

  class Capabilities
    def initialize(provider = nil)
      @provider = provider
    end

    def available?(id)
      id == 'drainage.rainwater_downpipe' && !@provider.nil?
    end

    def fetch(id)
      raise KeyError, id unless available?(id)
      @provider
    end
  end

  Runtime = Struct.new(:smart_objects, :connectors, :capabilities, keyword_init: true)

  def roof_definition(width: 1000, depth: 1000)
    JiraNot::ConstructFlow::Roof::RoofDefinition.new(
      boundary_mm: [[0, 0, 3000], [width, 0, 3000], [width, depth, 3000], [0, depth, 3000]],
      roof_form: 'flat', slope_percent: 0, low_elevation_mm: 3000
    )
  end

  def setup_fixture(edge_index: 0, outlet_ratio: 0.5, with_downpipe: false)
    repository = JiraNot::ConstructFlow::Roof::Repository.new
    roof_entity = FakeEntity.new
    gutter_entity = FakeEntity.new
    roof = ObjectStub.new(id: 'roof-1', type: 'roof.system', owner_module: 'constructflow.roof', entity: roof_entity)
    gutter = ObjectStub.new(id: 'gutter-1', type: 'roof.gutter', owner_module: 'constructflow.roof', entity: gutter_entity)
    repository.write_roof(roof_entity, roof_definition)

    model = FakeModel.new
    connectors = JiraNot::ConstructFlow::Core::ConnectorRegistry.new
    connectors.attach_model(model)
    connectors.register_compatibility(
      'roof.gutter_outlet', 'drainage.manhole_in', system: 'drainage.rainwater'
    )
    outlet = connectors.register_connector(
      owner_object_id: gutter.id, type: 'roof.gutter_outlet', role: 'outlet',
      position_mm: [500, 0, 3000], direction: [0, 0, -1]
    )
    repository.write_gutter(
      gutter_entity,
      JiraNot::ConstructFlow::Roof::GutterDefinition.new(
        roof_object_id: roof.id,
        edge_index: edge_index,
        outlet_ratio: outlet_ratio,
        outlet_connector_id: outlet['id']
      )
    )

    provider = with_downpipe ? DownpipeProvider.new : nil
    if with_downpipe
      target = connectors.register_connector(
        owner_object_id: 'mh-1', type: 'drainage.manhole_in', role: 'inlet',
        position_mm: [1500, 0, 0]
      )
      connectors.register_connection(
        from_connector_id: outlet['id'],
        to_connector_id: target['id'],
        system: 'drainage.rainwater',
        metadata: { route_object_id: 'dp-1', route_kind: 'downpipe' }
      )
    end

    geometry = GutterGeometry.new
    runtime = Runtime.new(
      smart_objects: SmartObjects.new([roof, gutter]),
      connectors: connectors,
      capabilities: Capabilities.new(provider)
    )
    [runtime, repository, geometry, roof, gutter, outlet, provider]
  end

  def test_roof_change_rebuilds_same_gutter_and_moves_same_outlet_connector
    runtime, repository, geometry, roof, gutter, outlet, = setup_fixture
    repository.write_roof(roof.entity, roof_definition(width: 2000))

    result = JiraNot::ConstructFlow::Roof::HostedGutterRegenerator.new(
      runtime: runtime, repository: repository, geometry: geometry
    ).refresh(roof)

    assert_equal ['gutter-1'], result[:gutter_object_ids]
    assert_equal ['gutter-1'], result[:updated_object_ids]
    assert_equal 1, geometry.rebuilt.length
    assert_equal gutter.entity, geometry.rebuilt.first[0]
    assert_equal outlet['id'], repository.read_gutter(gutter.entity).outlet_connector_id
    assert_equal [1000.0, 0.0, 3000.0], runtime.connectors.connector(outlet['id'])['position_mm']
  end

  def test_connected_downpipe_refresh_is_delegated_after_outlet_moves
    runtime, repository, geometry, roof, _gutter, outlet, provider = setup_fixture(with_downpipe: true)
    repository.write_roof(roof.entity, roof_definition(width: 2000))

    result = JiraNot::ConstructFlow::Roof::HostedGutterRegenerator.new(
      runtime: runtime, repository: repository, geometry: geometry
    ).refresh(roof)

    assert_equal [outlet['id']], provider.calls
    assert_equal ['dp-1'], result[:downpipe_object_ids]
    assert_equal %w[dp-1 gutter-1], result[:updated_object_ids].sort
    assert_equal [1000.0, 0.0, 3000.0], runtime.connectors.connector(outlet['id'])['position_mm']
  end

  def test_removed_host_edge_fails_instead_of_guessing_a_new_gutter_edge
    runtime, repository, geometry, roof, _gutter, outlet, = setup_fixture(edge_index: 3, outlet_ratio: 0.5)
    repository.write_roof(
      roof.entity,
      JiraNot::ConstructFlow::Roof::RoofDefinition.new(
        boundary_mm: [[0, 0, 3000], [1000, 0, 3000], [0, 1000, 3000]],
        roof_form: 'flat', slope_percent: 0, low_elevation_mm: 3000
      )
    )

    error = assert_raises(ArgumentError) do
      JiraNot::ConstructFlow::Roof::HostedGutterRegenerator.new(
        runtime: runtime, repository: repository, geometry: geometry
      ).refresh(roof)
    end

    assert_includes error.message, 'roof edge index out of range'
    assert_equal [500.0, 0.0, 3000.0], runtime.connectors.connector(outlet['id'])['position_mm']
    assert_empty geometry.rebuilt
  end
end
