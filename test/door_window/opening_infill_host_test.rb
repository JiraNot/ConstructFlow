# frozen_string_literal: true

require_relative '../test_helper'

class DWStubWallGeometry
  def rebuild!(entity, _definition, openings: [])
    entity.instance_variable_set(:@last_openings, openings)
    entity
  end
end

class OpeningInfillHostTest < Minitest::Test
  Core = JiraNot::ConstructFlow::Core
  Architecture = JiraNot::ConstructFlow::Architecture
  Opening = JiraNot::ConstructFlow::Opening
  DoorWindow = JiraNot::ConstructFlow::DoorWindow

  def setup
    @wall_entity = FakeEntity.new
    @opening_entity = FakeEntity.new
    @model = FakeModel.new([@wall_entity, @opening_entity])
    @manager = Core::SmartObjectManager.new(model: @model)

    @wall = @manager.create(
      entity: @wall_entity,
      type: 'architecture.wall',
      owner_module: 'constructflow.architecture',
      created_phase: Core::Phase::EXISTING
    )
    @wall_repository = Architecture::WallRepository.new
    @wall_repository.write(
      @wall_entity,
      Architecture::WallDefinition.new(
        path_mm: [[0, 0, 0], [5000, 0, 0]], thickness_mm: 100, height_mm: 2800
      )
    )
    @wall_host = Architecture::WallHostCapability.new(
      repository: @wall_repository,
      geometry: DWStubWallGeometry.new
    )

    @opening = @manager.create(
      entity: @opening_entity,
      type: 'opening.rectangular',
      owner_module: 'constructflow.opening',
      created_phase: Core::Phase::NEW_CONSTRUCTION
    )
    @opening_repository = Opening::OpeningRepository.new
    @opening_definition = Opening::OpeningDefinition.new(
      host_object_id: @wall.id,
      segment_index: 0,
      start_offset_mm: 1000,
      width_mm: 1200,
      height_mm: 1200,
      sill_mm: 900
    )
    @opening_repository.write(@opening_entity, @opening_definition)
    @infill_host = Opening::OpeningInfillHostCapability.new(
      repository: @opening_repository,
      object_resolver: ->(object_id) { @manager.fetch_by_id(object_id) },
      wall_host_capability: @wall_host
    )
  end

  def test_exact_fit_resize_and_invalid_fit_status
    assert_equal 'exact_fit', @infill_host.fit_status(@opening, width_mm: 1200, height_mm: 1200)
    assert_equal 'exact_fit', @infill_host.fit_status(@opening, width_mm: 1201, height_mm: 1199)
    assert_equal 'resize_required', @infill_host.fit_status(@opening, width_mm: 1000, height_mm: 1200)
    assert_equal 'not_compatible', @infill_host.fit_status(@opening, width_mm: -1, height_mm: 1200)
  end

  def test_attach_and_detach_infill_preserves_opening_identity
    before_id = @opening.id
    value = @infill_host.attach_infill(
      @opening,
      infill_id: 'cf_dw_1',
      infill_type: 'door_window.window',
      width_mm: 1200,
      height_mm: 1200
    )

    assert_equal 'cf_dw_1', value['infill_id']
    assert_equal 'cf_dw_1', @opening_repository.infill_ref(@opening_entity)['infill_id']
    assert_equal before_id, @manager.fetch(@opening_entity).id
    assert @infill_host.detach_infill(@opening, infill_id: 'cf_dw_1')
    assert_nil @opening_repository.infill_ref(@opening_entity)
    assert_equal before_id, @manager.fetch(@opening_entity).id
  end

  def test_second_infill_is_rejected
    @infill_host.attach_infill(
      @opening,
      infill_id: 'cf_dw_1',
      infill_type: 'door_window.window',
      width_mm: 1200,
      height_mm: 1200
    )

    errors = @infill_host.validate_infill(
      @opening,
      infill_id: 'cf_dw_2',
      width_mm: 1200,
      height_mm: 1200
    )
    assert_includes errors, 'opening already has an infill'
  end

  def test_validator_requires_exact_fit
    validator = DoorWindow::Validators::DoorWindowValidator.new(opening_host_capability: @infill_host)
    exact_type = DoorWindow::DoorWindowType.new(
      id: 'W01', category: 'window', operation: 'fixed', width_mm: 1200, height_mm: 1200
    )
    wrong_type = exact_type.with(width_mm: 1000)
    instance = DoorWindow::InstanceDefinition.new(type_id: 'W01', opening_object_id: @opening.id)

    assert_empty validator.validate(
      instance_definition: instance,
      type: exact_type,
      opening_object: @opening
    )
    messages = validator.validate(
      instance_definition: instance,
      type: wrong_type,
      opening_object: @opening
    ).map { |issue| issue[:message] }
    assert_includes messages, 'infill dimensions require opening resize'
  end

  def test_frame_points_follow_opening_on_wall
    points = @infill_host.frame_points(@opening)

    assert_equal 4, points.length
    assert_equal [1000.0, 0.0, 900.0], points[0]
    assert_equal [2200.0, 0.0, 2100.0], points[2]
  end
end
