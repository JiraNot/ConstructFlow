# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOF, 'hosted_gutter_regenerator')

class HostedGutterRegeneratorTest < Minitest::Test
  SmartStub = Struct.new(:id, :entity, :type, :owner_module, keyword_init: true)

  class SmartObjects
    attr_reader :dirty

    def initialize(objects)
      @objects = objects.index_by(&:id)
      @dirty = []
    end

    def fetch_by_id(id) = @objects[id.to_s]
    def all = @objects.values

    def mark_dirty(entity, *flags)
      @dirty << [entity, flags]
    end
  end

  class FakeGeometry
    attr_reader :calls

    def initialize
      @calls = []
    end

    def rebuild_gutter!(entity, roof_object:, definition:, edge_capability:)
      @calls << [entity, roof_object.id, definition.edge_index, edge_capability.edge_points_mm(roof_object, definition.edge_index)]
      entity
    end
  end

  Runtime = Struct.new(:smart_objects, :connectors, keyword_init: true)

  def setup
    @repository = JiraNot::ConstructFlow::Roof::Repository.new
    @roof_entity = FakeEntity.new
    @gutter_entity = FakeEntity.new
    @roof = SmartStub.new(id: 'roof-1', entity: @roof_entity, type: 'roof.system', owner_module: 'constructflow.roof')
    @gutter = SmartStub.new(id: 'gutter-1', entity: @gutter_entity, type: 'roof.gutter', owner_module: 'constructflow.roof')
    @repository.write_roof(@roof_entity, roof_definition(width: 4000))

    @model = FakeModel.new
    @connectors = JiraNot::ConstructFlow::Core::ConnectorRegistry.new
    @connectors.attach_model(@model)
    outlet = @connectors.register_connector(
      owner_object_id: @gutter.id,
      type: 'roof.gutter_outlet', role: 'outlet',
      position_mm: [4000, 0, 3000], properties: { gravity: true }
    )
    @repository.write_gutter(
      @gutter_entity,
      JiraNot::ConstructFlow::Roof::GutterDefinition.new(
        roof_object_id: @roof.id, edge_index: 0, outlet_ratio: 1.0,
        outlet_connector_id: outlet['id']
      )
    )
    @smart_objects = SmartObjects.new([@roof, @gutter])
    @geometry = FakeGeometry.new
    @runtime = Runtime.new(smart_objects: @smart_objects, connectors: @connectors)
  end

  def test_rebuilds_gutter_and_moves_same_outlet_connector_after_roof_change
    @repository.write_roof(@roof_entity, roof_definition(width: 5000))
    connector_id = @repository.read_gutter(@gutter_entity).outlet_connector_id

    result = JiraNot::ConstructFlow::Roof::HostedGutterRegenerator.new(
      runtime: @runtime, repository: @repository, geometry: @geometry
    ).regenerate(roof_object_id: @roof.id)

    assert_equal ['gutter-1'], result['regenerated_gutter_ids']
    assert_equal 1, result['moved_outlets'].length
    assert_equal connector_id, result['moved_outlets'][0]['connector_id']
    assert_equal [5000.0, 0.0, 3000.0], @connectors.connector(connector_id)['position_mm']
    assert_equal 1, @geometry.calls.length
    assert @smart_objects.dirty.any? { |entity, flags| entity.equal?(@gutter_entity) && flags.include?('dirty_drawing') }
  end

  def test_missing_host_edge_is_reported_and_not_silently_rehosted
    connector_id = @repository.read_gutter(@gutter_entity).outlet_connector_id
    @repository.write_gutter(
      @gutter_entity,
      JiraNot::ConstructFlow::Roof::GutterDefinition.new(
        roof_object_id: @roof.id, edge_index: 3, outlet_ratio: 1.0,
        outlet_connector_id: connector_id
      )
    )
    triangular = JiraNot::ConstructFlow::Roof::RoofDefinition.new(
      boundary_mm: [[0, 0, 0], [4000, 0, 0], [0, 3000, 0]],
      slope_percent: 5, slope_direction_xy: [0, 1], low_elevation_mm: 3000
    )
    @repository.write_roof(@roof_entity, triangular)

    result = JiraNot::ConstructFlow::Roof::HostedGutterRegenerator.new(
      runtime: @runtime, repository: @repository, geometry: @geometry
    ).regenerate(roof_object_id: @roof.id)

    assert_empty result['regenerated_gutter_ids']
    assert_equal 'gutter-1', result['invalid_gutters'][0]['gutter_id']
    assert_includes result['invalid_gutters'][0]['message'], 'edge index out of range'
    assert_equal [4000, 0, 3000], @connectors.connector(connector_id)['position_mm']
    assert @smart_objects.dirty.any? { |entity, flags| entity.equal?(@gutter_entity) && flags.include?('dirty_geometry') }
  end

  private

  def roof_definition(width:)
    JiraNot::ConstructFlow::Roof::RoofDefinition.new(
      boundary_mm: [[0, 0, 0], [width, 0, 0], [width, 3000, 0], [0, 3000, 0]],
      slope_percent: 5, slope_direction_xy: [0, 1], low_elevation_mm: 3000
    )
  end
end
