# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/architecture/wall_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/architecture/wall_repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/opening/opening_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/opening/opening_repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/door_window/door_window_type')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/door_window/type_registry')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/door_window/instance_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/door_window/instance_repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/door_window/plan_representation_provider')

DoorWindowPlanObject = Struct.new(:id, :type, :entity, :owner_module)

class DoorWindowPlanSmartObjects
  def initialize(objects)
    @objects = objects
  end

  def fetch_by_id(id)
    @objects[id]
  end
end

class DoorWindowPlanRuntime
  attr_reader :active_model, :smart_objects

  def initialize(model, objects)
    @active_model = model
    @smart_objects = DoorWindowPlanSmartObjects.new(objects)
  end
end

class DoorWindowPlanRepresentationProviderTest < Minitest::Test
  def request(lod)
    {
      'view' => 'plan', 'scale' => '1:50', 'phase_view' => 'proposed', 'lod' => lod,
      'context' => { 'style_preset' => "door_window.#{lod}" }
    }
  end

  def fixture(operation:, handing: 'left', category: 'door', location_line: 'center')
    model = FakeAttributeCarrier.new
    type = JiraNot::ConstructFlow::DoorWindow::DoorWindowType.new(
      id: "type.#{operation}", name: "#{operation.capitalize} Type", category: category,
      operation: operation, width_mm: 900, height_mm: 2100, frame_material: 'aluminium'
    )
    JiraNot::ConstructFlow::DoorWindow::TypeRegistry.new(model).register(type)

    wall_entity = FakeAttributeCarrier.new
    wall_repo = JiraNot::ConstructFlow::Architecture::WallRepository.new
    wall_repo.write(
      wall_entity,
      JiraNot::ConstructFlow::Architecture::WallDefinition.new(
        path_mm: [[0, 0, 0], [4000, 0, 0]], thickness_mm: 150, height_mm: 2800,
        location_line: location_line
      )
    )
    wall = DoorWindowPlanObject.new('wall-1', 'architecture.wall', wall_entity, 'constructflow.architecture')

    opening_entity = FakeAttributeCarrier.new
    opening_repo = JiraNot::ConstructFlow::Opening::OpeningRepository.new
    opening_repo.write(
      opening_entity,
      JiraNot::ConstructFlow::Opening::OpeningDefinition.new(
        host_object_id: 'wall-1', segment_index: 0, start_offset_mm: 1000,
        width_mm: 900, height_mm: 2100, sill_mm: 0
      )
    )
    opening = DoorWindowPlanObject.new('opening-1', 'opening.rectangular', opening_entity, 'constructflow.opening')

    instance_entity = FakeAttributeCarrier.new
    instance_repo = JiraNot::ConstructFlow::DoorWindow::InstanceRepository.new
    instance_repo.write(
      instance_entity,
      JiraNot::ConstructFlow::DoorWindow::InstanceDefinition.new(
        type_id: type.id, opening_object_id: 'opening-1', handing: handing, schedule_mark: 'D01'
      )
    )
    instance = DoorWindowPlanObject.new('door-1', 'door_window.instance', instance_entity, 'constructflow.door_window')
    runtime = DoorWindowPlanRuntime.new(model, 'wall-1' => wall, 'opening-1' => opening)
    provider = JiraNot::ConstructFlow::DoorWindow::PlanRepresentationProvider.new(
      runtime: runtime, repository: instance_repo, opening_repository: opening_repo, wall_repository: wall_repo
    )
    [provider, instance]
  end

  def test_swing_door_construction_plan_contains_leaf_arc_and_mark
    provider, instance = fixture(operation: 'swing')
    result = provider.render(object: instance, request: request('construction'))

    assert result[:primitives].any? { |item| item['role'] == 'door_window_opening_span' }
    assert result[:primitives].any? { |item| item['role'] == 'swing_leaf' }
    assert result[:primitives].any? { |item| item['role'] == 'swing_arc' }
    assert result[:annotations].any? { |item| item['role'] == 'schedule_mark' && item['text'] == 'D01' }
  end

  def test_sliding_window_coordination_plan_contains_direction_and_host_trace
    provider, instance = fixture(operation: 'sliding', handing: 'default', category: 'window')
    result = provider.render(object: instance, request: request('coordination'))

    assert result[:primitives].any? { |item| item['role'] == 'sliding_direction' }
    assert result[:annotations].any? { |item| item['role'] == 'opening_host' }
    assert result[:annotations].any? { |item| item['role'] == 'frame_material' }
    assert_equal 'sliding', result[:metadata]['operation']
  end

  def test_hosted_plan_geometry_uses_wall_location_line_centerline
    provider, instance = fixture(operation: 'fixed', category: 'window', location_line: 'finish_face_exterior')
    result = provider.render(object: instance, request: request('simple'))
    span = result[:primitives].find { |item| item['role'] == 'door_window_opening_span' }

    assert_equal [1000.0, -75.0, 0.0], span['points_mm'][0]
    assert_equal [1900.0, -75.0, 0.0], span['points_mm'][1]
  end
end
