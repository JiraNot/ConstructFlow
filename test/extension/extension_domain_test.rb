# frozen_string_literal: true

require_relative '../test_helper'

class ExtensionDomainTest < Minitest::Test
  SmartObjectStub = Struct.new(:id, :entity, :owner_module, :type, :created_phase, :removed_phase, :source_state, keyword_init: true)

  def definition
    JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
      boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]],
      program: 'carport',
      target_height_mm: 3000,
      roof_intent: 'lean_to'
    )
  end

  def test_extension_area_perimeter_and_repository_round_trip
    value = definition
    assert value.valid?
    assert_in_delta 12_000_000.0, value.area_mm2, 0.001
    assert_in_delta 14_000.0, value.perimeter_mm, 0.001

    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Extension::Repository.new
    repository.write(entity, value)
    restored = repository.read(entity)

    assert_equal value.to_h, restored.to_h
  end

  def test_boundary_capability_reads_extension_without_domain_leakage
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Extension::Repository.new
    repository.write(entity, definition)
    object = SmartObjectStub.new(
      id: 'cf_ext_1', entity: entity,
      owner_module: 'constructflow.extension', type: 'extension.zone'
    )
    capability = JiraNot::ConstructFlow::Extension::BoundaryCapability.new(repository: repository)

    assert capability.compatible?(object)
    assert_equal definition.boundary_mm, capability.boundary_mm(object)
    assert_equal 'lean_to', capability.roof_intent(object)
    assert_in_delta 3000.0, capability.target_height_mm(object), 0.001
  end

  def test_extension_quantity_is_summary_only_and_traceable
    object = SmartObjectStub.new(
      id: 'cf_ext_1',
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil,
      source_state: 'confirmed'
    )
    items = JiraNot::ConstructFlow::Extension::Quantity::ExtensionQuantityProvider.new
            .quantities(smart_object: object, definition: definition)

    area = items.find { |item| item[:classification] == 'extension.zone.area' }
    perimeter = items.find { |item| item[:classification] == 'extension.zone.perimeter' }
    assert_in_delta 12.0, area[:value], 0.001
    assert_equal 'm2', area[:unit]
    assert_in_delta 14.0, perimeter[:value], 0.001
    assert_equal 'cf_ext_1', area[:source_object_id]
  end

  def test_invalid_open_boundary_is_rejected_by_area_rule
    value = JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
      boundary_mm: [[0, 0, 0], [1000, 0, 0]],
      program: 'custom'
    )
    refute value.valid?
    assert_includes value.errors, 'extension boundary requires at least three points'
  end
end
