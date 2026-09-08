# frozen_string_literal: true

require_relative '../test_helper'

class FakeWallGeometry
  attr_reader :rebuilds

  def initialize
    @rebuilds = []
  end

  def rebuild!(entity, definition, openings: [])
    @rebuilds << { entity: entity, definition: definition, openings: openings.map(&:dup) }
    entity
  end
end

class OpeningHostTest < Minitest::Test
  Core = JiraNot::ConstructFlow::Core
  Architecture = JiraNot::ConstructFlow::Architecture
  Opening = JiraNot::ConstructFlow::Opening

  def setup
    @model = FakeModel.new
    @manager = Core::SmartObjectManager.new(model: @model)
    @wall_entity = FakeEntity.new
    @model.entities << @wall_entity
    @wall_object = @manager.create(
      entity: @wall_entity,
      type: 'architecture.wall',
      owner_module: 'constructflow.architecture',
      created_phase: Core::Phase::EXISTING
    )
    @wall_repository = Architecture::WallRepository.new
    @wall_repository.write(
      @wall_entity,
      Architecture::WallDefinition.new(
        path_mm: [[0, 0, 0], [5000, 0, 0]],
        thickness_mm: 100,
        height_mm: 2800
      )
    )
    @wall_geometry = FakeWallGeometry.new
    @host = Architecture::WallHostCapability.new(
      repository: @wall_repository,
      geometry: @wall_geometry
    )
  end

  def test_opening_definition_round_trip
    definition = Opening::OpeningDefinition.new(
      host_object_id: @wall_object.id,
      segment_index: 0,
      start_offset_mm: 1000,
      width_mm: 1200,
      height_mm: 2100,
      sill_mm: 100
    )

    restored = Opening::OpeningDefinition.from_h(definition.to_h)

    assert restored.valid?
    assert_equal @wall_object.id, restored.host_object_id
    assert_equal 1_200.0, restored.width_mm
    assert_equal 2_520_000.0, restored.area_mm2
  end

  def test_host_location_projects_point_to_wall_segment
    placement = @host.locate(@wall_object, [2500, 400, 0])

    assert_equal 0, placement[:segment_index]
    assert_in_delta 2500.0, placement[:distance_along_mm], 0.001
    assert_in_delta 400.0, placement[:distance_to_host_mm], 0.001
  end

  def test_attach_update_and_detach_opening_rebuilds_host
    descriptor = {
      segment_index: 0,
      start_offset_mm: 1000,
      width_mm: 900,
      height_mm: 2100,
      sill_mm: 0
    }

    attached = @host.attach_opening(@wall_object, opening_id: 'cf_opening_1', descriptor: descriptor)
    assert_equal 'cf_opening_1', attached['opening_id']
    assert_equal 1, @wall_repository.host_openings(@wall_entity).length
    assert_equal 1, @wall_geometry.rebuilds.length

    @host.update_opening(
      @wall_object,
      opening_id: 'cf_opening_1',
      descriptor: descriptor.merge(width_mm: 1200)
    )
    assert_equal 1_200.0, @wall_repository.host_openings(@wall_entity).first['width_mm']
    assert_equal 2, @wall_geometry.rebuilds.length

    assert @host.detach_opening(@wall_object, opening_id: 'cf_opening_1')
    assert_empty @wall_repository.host_openings(@wall_entity)
    assert_equal 3, @wall_geometry.rebuilds.length
  end

  def test_out_of_bounds_and_overlapping_openings_are_rejected
    @host.attach_opening(
      @wall_object,
      opening_id: 'cf_opening_1',
      descriptor: {
        segment_index: 0,
        start_offset_mm: 1000,
        width_mm: 1000,
        height_mm: 2000,
        sill_mm: 0
      }
    )

    overlap = @host.validate_opening(
      @wall_object,
      {
        opening_id: 'cf_opening_2',
        segment_index: 0,
        start_offset_mm: 1500,
        width_mm: 1000,
        height_mm: 2000,
        sill_mm: 0
      }
    )
    assert_includes overlap, 'opening overlaps another hosted opening'

    outside = @host.validate_opening(
      @wall_object,
      {
        opening_id: 'cf_opening_3',
        segment_index: 0,
        start_offset_mm: 4700,
        width_mm: 900,
        height_mm: 3000,
        sill_mm: 0
      }
    )
    assert_includes outside, 'opening extends beyond wall segment'
    assert_includes outside, 'opening extends above wall height'
  end

  def test_opening_repository_owns_domain_namespace
    entity = FakeEntity.new
    repository = Opening::OpeningRepository.new
    definition = Opening::OpeningDefinition.new(
      host_object_id: @wall_object.id,
      segment_index: 0,
      start_offset_mm: 600,
      width_mm: 900,
      height_mm: 2100,
      sill_mm: 0
    )

    repository.write(entity, definition)
    restored = repository.read(entity)

    assert_equal definition.to_h, restored.to_h
    assert_nil Core::AttributeStore.new(entity).read('opening_definition')
    refute_nil Core::AttributeStore.new(entity).read_json(
      'opening_definition',
      nil,
      dictionary: 'constructflow.opening'
    )
  end

  def test_existing_host_opening_quantity_is_demolition_scope
    opening_entity = FakeEntity.new
    @model.entities << opening_entity
    opening_object = @manager.create(
      entity: opening_entity,
      type: 'opening.rectangular',
      owner_module: 'constructflow.opening',
      created_phase: Core::Phase::NEW_CONSTRUCTION
    )
    definition = Opening::OpeningDefinition.new(
      host_object_id: @wall_object.id,
      segment_index: 0,
      start_offset_mm: 1000,
      width_mm: 1000,
      height_mm: 2000,
      sill_mm: 0
    )

    item = Opening::Quantity::OpeningQuantityProvider.new.quantities(
      smart_object: opening_object,
      definition: definition,
      host_object: @wall_object
    ).first

    assert_equal 'demolition', item[:phase_scope]
    assert_equal 'm2', item[:unit]
    assert_in_delta 2.0, item[:value], 0.0001
    assert_equal opening_object.id, item[:source_object_id]
  end

  def test_smart_object_relationship_helpers_persist_host_link
    opening_entity = FakeEntity.new
    @model.entities << opening_entity
    @manager.create(
      entity: opening_entity,
      type: 'opening.rectangular',
      owner_module: 'constructflow.opening'
    )

    relationship = @manager.add_relationship(
      opening_entity,
      kind: 'host',
      target_id: @wall_object.id,
      role: 'modifies_existing_host'
    )

    object = @manager.fetch(opening_entity)
    assert_equal 1, object.relationships.length
    assert_equal relationship['id'], object.relationships.first['id']
    assert_equal @wall_object.id, object.relationships.first['target_id']

    assert_equal 1, @manager.remove_relationship(opening_entity, relationship_id: relationship['id'])
    assert_empty @manager.fetch(opening_entity).relationships
  end
end
