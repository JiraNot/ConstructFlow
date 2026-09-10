# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/device_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/circuit_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/plan_representation_provider')

ElectricalPlanObject = Struct.new(:id, :type, :entity)

class ElectricalPlanSmartObjects
  def initialize(objects = {})
    @objects = objects
  end

  def fetch_by_id(id)
    @objects[id.to_s]
  end
end

class ElectricalPlanRuntime
  attr_reader :active_model, :smart_objects

  def initialize(model, objects = {})
    @active_model = model
    @smart_objects = ElectricalPlanSmartObjects.new(objects)
  end
end

class ElectricalPlanRepresentationProviderTest < Minitest::Test
  def setup
    @repository = JiraNot::ConstructFlow::Electrical::Repository.new
    @model = FakeAttributeCarrier.new
  end

  def request(lod)
    {
      'view' => 'plan', 'scale' => lod == 'simple' ? '1:100' : '1:50',
      'phase_view' => lod == 'construction' ? 'proposed' : 'coordination',
      'lod' => lod, 'context' => { 'style_preset' => "electrical.#{lod}" }
    }
  end

  def device(kind:, type:, position:, mark:, circuit: nil, host: nil, level: nil, wattage: nil)
    JiraNot::ConstructFlow::Electrical::DeviceDefinition.new(
      kind: kind, device_type: type, position_mm: position,
      mounting: kind == 'luminaire' ? 'ceiling' : 'wall',
      schedule_mark: mark, circuit_id: circuit, host_object_id: host,
      level_id: level, mounting_height_mm: kind == 'switch' ? 1200 : 0,
      wattage: wattage
    )
  end

  def test_simple_luminaire_is_lightweight_symbol_and_mark
    entity = FakeAttributeCarrier.new
    @repository.write_device(entity, device(kind: 'luminaire', type: 'downlight', position: [1000, 2000, 2700], mark: 'L01'))
    object = ElectricalPlanObject.new('light-1', 'electrical.luminaire', entity)
    provider = JiraNot::ConstructFlow::Electrical::PlanRepresentationProvider.new(
      runtime: ElectricalPlanRuntime.new(@model), repository: @repository
    )

    result = provider.render(object: object, request: request('simple'))

    assert_equal 'electrical_device', result[:primitives].first['role']
    assert_equal 'L', result[:primitives].first['symbol']
    assert_equal 'L01', result[:annotations].first['text']
    refute result[:annotations].any? { |item| item['role'] == 'circuit' }
    assert_equal 'electrical_plan', result[:metadata]['drawing_family']
  end

  def test_construction_switch_draws_logical_control_relations_without_wire_geometry
    switch_entity = FakeAttributeCarrier.new
    light_entity = FakeAttributeCarrier.new
    @repository.write_device(switch_entity, device(kind: 'switch', type: 'one_way', position: [500, 500, 1200], mark: 'S01'))
    @repository.write_device(light_entity, device(kind: 'luminaire', type: 'downlight', position: [2500, 2000, 2700], mark: 'L01', circuit: 'LT-01', wattage: 9))
    switch_object = ElectricalPlanObject.new('switch-1', 'electrical.switch', switch_entity)
    light_object = ElectricalPlanObject.new('light-1', 'electrical.luminaire', light_entity)
    @repository.add_control_relation(@model, switch_object_id: 'switch-1', load_object_ids: ['light-1'])
    runtime = ElectricalPlanRuntime.new(@model, 'light-1' => light_object)
    provider = JiraNot::ConstructFlow::Electrical::PlanRepresentationProvider.new(runtime: runtime, repository: @repository)

    result = provider.render(object: switch_object, request: request('construction'))

    relation = result[:primitives].find { |item| item['role'] == 'control_relation' }
    refute_nil relation
    assert_equal [[500.0, 500.0, 1200.0], [2500.0, 2000.0, 2700.0]], relation['points_mm']
    assert_equal ['light-1'], result[:metadata]['control_target_ids']
  end

  def test_coordination_output_contains_host_level_and_mounting_context
    entity = FakeAttributeCarrier.new
    @repository.write_device(
      entity,
      device(kind: 'outlet', type: 'double_socket', position: [1800, 300, 300], mark: 'P01',
             circuit: 'P-01', host: 'wall-1', level: 'L1')
    )
    object = ElectricalPlanObject.new('outlet-1', 'electrical.outlet', entity)
    provider = JiraNot::ConstructFlow::Electrical::PlanRepresentationProvider.new(
      runtime: ElectricalPlanRuntime.new(@model), repository: @repository
    )

    result = provider.render(object: object, request: request('coordination'))

    assert result[:annotations].any? { |item| item['role'] == 'host' }
    assert result[:annotations].any? { |item| item['role'] == 'level' }
    assert result[:annotations].any? { |item| item['role'] == 'mounting' }
    assert result[:annotations].any? { |item| item['role'] == 'circuit' }
  end
end
