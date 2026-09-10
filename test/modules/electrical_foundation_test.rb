# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/device_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/circuit_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/repository')

class ElectricalFoundationTest < Minitest::Test
  def setup
    @repository = JiraNot::ConstructFlow::Electrical::Repository.new
  end

  def test_device_definition_round_trips_and_updates_circuit_without_changing_semantics
    entity = FakeAttributeCarrier.new
    definition = JiraNot::ConstructFlow::Electrical::DeviceDefinition.new(
      kind: 'luminaire', device_type: 'downlight', position_mm: [1200, 900, 2700],
      mounting: 'ceiling', host_object_id: 'ceiling-1', level_id: 'L1', wattage: 9,
      cct_k: 3000, schedule_mark: 'L01'
    )

    @repository.write_device(entity, definition)
    loaded = @repository.read_device(entity)
    updated = loaded.with(circuit_id: 'LT-01')

    assert_equal 'luminaire', loaded.kind
    assert_equal [1200.0, 900.0, 2700.0], loaded.position_mm
    assert_equal 'ceiling-1', loaded.host_object_id
    assert_equal 'L01', loaded.schedule_mark
    assert_equal 'LT-01', updated.circuit_id
    assert_equal loaded.position_mm, updated.position_mm
  end

  def test_circuit_membership_and_control_relations_are_persisted_semantically
    model = FakeAttributeCarrier.new
    circuit = JiraNot::ConstructFlow::Electrical::CircuitDefinition.new(
      id: 'LT-01', name: 'Living Lights', circuit_type: 'lighting', rating_a: 10
    )
    @repository.write_circuit(model, circuit.with_devices(%w[light-1 light-2 light-1]))
    relation = @repository.add_control_relation(
      model, switch_object_id: 'switch-1', load_object_ids: %w[light-1 light-2 light-1]
    )

    loaded = @repository.circuit(model, 'LT-01')
    assert_equal %w[light-1 light-2], loaded.device_object_ids
    assert_equal 10.0, loaded.rating_a
    assert_equal 'switch-1', relation['switch_object_id']
    assert_equal %w[light-1 light-2], relation['load_object_ids']
    assert_equal relation, @repository.control_relations(model).first
  end

  def test_validation_rejects_unsupported_device_kind_and_negative_power
    definition = JiraNot::ConstructFlow::Electrical::DeviceDefinition.new(
      kind: 'transformer', device_type: 'generic', position_mm: [0, 0, 0],
      mounting: 'wall', wattage: -5
    )

    refute definition.valid?
    assert_includes definition.errors, 'unsupported electrical device kind'
    assert_includes definition.errors, 'wattage cannot be negative'
  end
end
