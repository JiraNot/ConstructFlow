# frozen_string_literal: true

require_relative '../test_helper'

class StructureGridTest < Minitest::Test
  GridObject = Struct.new(:id, :type, :entity)

  Runtime = Struct.new(:smart_objects)
  SmartObjects = Struct.new(:objects) do
    def all
      objects
    end
  end

  def grid_definition
    JiraNot::ConstructFlow::Structure::GridDefinition.new(
      name: 'A', path_mm: [[0, 0, 2500], [5000, 0, 2500]], level_id: 'L1', offset_mm: 100
    )
  end

  def test_grid_definition_round_trips_and_rejects_degenerate_lines
    definition = grid_definition
    assert definition.valid?
    assert_equal definition.to_h, JiraNot::ConstructFlow::Structure::GridDefinition.from_h(definition.to_h).to_h

    invalid = definition.with(path_mm: [[0, 0, 0], [0, 0, 0]])
    refute invalid.valid?
    assert_includes invalid.errors, 'grid path contains zero length'
  end

  def test_grid_is_exposed_as_a_plan_reference_with_source_identity
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Structure::Repository.new
    repository.write_grid(entity, grid_definition)
    object = GridObject.new('grid-1', 'structure.grid', entity)
    runtime = Runtime.new(SmartObjects.new([object]))

    references = JiraNot::ConstructFlow::Architecture::PlanReferenceCollector.new(runtime).paths

    assert_equal [[0.0, 0.0, 2500.0], [5000.0, 0.0, 2500.0]], references.first[:path_mm]
    assert_equal 'grid-1', references.first[:source_object_id]
    assert_equal 'structure.grid', references.first[:source_type]
  end
end
