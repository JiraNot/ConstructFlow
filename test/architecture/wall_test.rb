# frozen_string_literal: true

require_relative '../test_helper'

class WallDefinitionTest < Minitest::Test
  WallDefinition = JiraNot::ConstructFlow::Architecture::WallDefinition

  def test_wall_calculates_length_area_and_volume
    wall = WallDefinition.new(
      path_mm: [[0, 0, 0], [3_000, 4_000, 0]],
      thickness_mm: 100,
      height_mm: 2_800
    )

    assert_in_delta 5_000.0, wall.length_mm, 0.001
    assert_in_delta 14_000_000.0, wall.gross_area_mm2, 0.001
    assert_in_delta 1_400_000_000.0, wall.volume_mm3, 0.001
  end

  def test_wall_definition_is_immutable_but_can_derive_updated_copy
    wall = WallDefinition.new(path_mm: [[0, 0, 0], [1_000, 0, 0]])
    changed = wall.with(thickness_mm: 150)

    assert_equal 100.0, wall.thickness_mm
    assert_equal 150.0, changed.thickness_mm
    assert_equal wall.path_mm, changed.path_mm
  end

  def test_zero_thickness_and_zero_length_segment_are_invalid
    wall = WallDefinition.new(
      path_mm: [[0, 0, 0], [0, 0, 0]],
      thickness_mm: 0,
      height_mm: 2_800
    )

    refute wall.valid?
    assert_includes wall.errors, 'wall thickness must be greater than zero'
    assert_includes wall.errors, 'wall path contains zero-length segment'
  end
end

class WallRepositoryTest < Minitest::Test
  def test_architecture_payload_round_trips_without_writing_core_namespace
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Architecture::WallRepository.new
    definition = JiraNot::ConstructFlow::Architecture::WallDefinition.new(
      path_mm: [[0, 0, 450], [3_000, 0, 450]],
      thickness_mm: 125,
      height_mm: 2_700,
      wall_type_id: 'wall.aac.100'
    )

    repository.write(entity, definition)
    recovered = repository.read(entity)

    assert_equal definition.to_h, recovered.to_h
    assert_nil entity.get_attribute('constructflow.core', 'wall_definition', nil)
    refute_nil entity.get_attribute('constructflow.architecture', 'wall_definition', nil)
  end
end

class WallValidatorTest < Minitest::Test
  def test_validator_returns_actionable_rule
    definition = JiraNot::ConstructFlow::Architecture::WallDefinition.new(
      path_mm: [[0, 0, 0], [1_000, 0, 0]],
      height_mm: -1
    )
    issues = JiraNot::ConstructFlow::Architecture::Validators::WallValidator.new.validate(definition)

    assert_equal 1, issues.length
    assert_equal 'architecture.wall.validity', issues.first[:rule]
    assert_equal 'error', issues.first[:severity]
  end
end

class WallQuantityProviderTest < Minitest::Test
  def setup
    @entity = FakeEntity.new
    @smart_object = JiraNot::ConstructFlow::Core::SmartObject.new(
      entity: @entity,
      id: 'cf_wall_001',
      type: 'architecture.wall',
      owner_module: 'constructflow.architecture',
      schema_version: 1,
      display_name: 'Wall',
      created_phase: 'new_construction',
      removed_phase: nil,
      level_refs: [],
      status: 'active',
      relationships: [],
      geometry_refs: [],
      catalog_ref: nil,
      source_state: 'confirmed',
      revision_meta: {},
      created_at: nil,
      updated_at: nil
    )
    @definition = JiraNot::ConstructFlow::Architecture::WallDefinition.new(
      path_mm: [[0, 0, 0], [5_000, 0, 0]],
      thickness_mm: 100,
      height_mm: 2_800
    )
    @provider = JiraNot::ConstructFlow::Architecture::Quantity::WallQuantityProvider.new
  end

  def test_provider_outputs_normalized_traceable_area_and_volume
    items = @provider.quantities(smart_object: @smart_object, definition: @definition)
    area, volume = items

    assert_equal 'cf_wall_001', area[:source_object_id]
    assert_equal 'constructflow.architecture', area[:source_module]
    assert_equal 'architecture.wall.gross_area', area[:classification]
    assert_equal 'm2', area[:unit]
    assert_in_delta 14.0, area[:value], 0.000001
    assert_equal 'new_construction', area[:phase_scope]

    assert_equal 'm3', volume[:unit]
    assert_in_delta 1.4, volume[:value], 0.000001
    assert_equal 1, volume[:formula_version]
  end

  def test_demolished_existing_wall_quantities_are_demolition_scope
    demolished = JiraNot::ConstructFlow::Core::SmartObject.new(
      entity: @entity,
      id: 'cf_wall_existing',
      type: 'architecture.wall',
      owner_module: 'constructflow.architecture',
      schema_version: 1,
      display_name: 'Existing Wall',
      created_phase: 'existing',
      removed_phase: 'demolition',
      level_refs: [],
      status: 'active',
      relationships: [],
      geometry_refs: [],
      catalog_ref: nil,
      source_state: 'measured',
      revision_meta: {},
      created_at: nil,
      updated_at: nil
    )

    items = @provider.quantities(smart_object: demolished, definition: @definition)

    assert items.all? { |item| item[:phase_scope] == 'demolition' }
    assert items.all? { |item| item[:confidence] == 'measured' }
  end
end
