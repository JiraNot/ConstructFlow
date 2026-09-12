# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'architecture', 'registration')

class CeilingDefinitionTest < Minitest::Test
  CeilingDefinition = JiraNot::ConstructFlow::Architecture::CeilingDefinition

  def test_architecture_manifest_declares_ceiling_quantity_provider
    manifest = JiraNot::ConstructFlow::Architecture::Registration::MANIFEST

    assert_includes manifest[:provides], 'architecture.ceiling_quantity'
    assert_includes manifest[:providers], 'constructflow.architecture.ceiling_quantity'
  end

  def test_ceiling_tracks_area_height_and_material
    ceiling = CeilingDefinition.new(
      boundary_mm: [[0, 0, 2700], [4000, 0, 2700], [4000, 3000, 2700], [0, 3000, 2700]],
      level_id: 'ground', height_mm: 2700, material_id: 'gypsum'
    )

    assert ceiling.valid?
    assert_in_delta 12_000_000.0, ceiling.net_area_mm2, 0.001
    assert_equal 'gypsum', ceiling.material_id
  end

  def test_ceiling_rejects_negative_height_and_zero_thickness
    ceiling = CeilingDefinition.new(
      boundary_mm: [[0, 0, 0], [1000, 0, 0], [1000, 1000, 0]], height_mm: -1, thickness_mm: 0
    )

    refute ceiling.valid?
    assert_includes ceiling.errors, 'ceiling height must be zero or greater'
    assert_includes ceiling.errors, 'ceiling thickness must be greater than zero'
  end

  def test_ceiling_payload_round_trip
    ceiling = CeilingDefinition.new(
      boundary_mm: [[0, 0, 2700], [2000, 0, 2700], [2000, 2000, 2700]], level_id: 'L1', height_mm: 2700
    )

    assert_equal ceiling.to_h, CeilingDefinition.from_h(ceiling.to_h).to_h
  end

  def test_ceiling_quantity_provider_is_traceable
    object = JiraNot::ConstructFlow::Core::SmartObject.new(
      entity: FakeEntity.new, id: 'ceiling-1', type: 'architecture.ceiling', owner_module: 'constructflow.architecture',
      schema_version: 1, display_name: 'Ceiling', created_phase: 'new_construction', removed_phase: nil,
      level_refs: [], status: 'active', relationships: [], geometry_refs: [], catalog_ref: nil,
      source_state: 'confirmed', revision_meta: {}, created_at: nil, updated_at: nil
    )
    definition = CeilingDefinition.new(boundary_mm: [[0, 0, 2700], [2000, 0, 2700], [2000, 2000, 2700]], thickness_mm: 12)
    items = JiraNot::ConstructFlow::Architecture::Quantity::CeilingQuantityProvider.new.quantities(
      smart_object: object, definition: definition
    )

    assert_equal 'architecture.ceiling.net_area', items.first[:classification]
    assert_equal 'ceiling-1', items.first[:source_object_id]
  end
end
