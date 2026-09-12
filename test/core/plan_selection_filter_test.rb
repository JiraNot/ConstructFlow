# frozen_string_literal: true

require_relative '../test_helper'

class PlanSelectionFilterTest < Minitest::Test
  Filter = JiraNot::ConstructFlow::Core::PlanSelectionFilter
  ObjectStub = Struct.new(:type, :level_refs)

  def test_filters_by_type_and_level_for_native_or_hash_objects
    wall = ObjectStub.new('architecture.wall', [{ 'level_id' => 'level-1' }])
    floor = { type: 'architecture.floor', level_refs: [{ level_id: 'level-1' }] }
    other_level = ObjectStub.new('architecture.wall', [{ 'level_id' => 'level-2' }])
    filter = Filter.new(object_types: ['architecture.wall'], level_id: 'level-1')

    assert filter.match?(wall)
    refute filter.match?(floor)
    refute filter.match?(other_level)
    assert_equal [wall], filter.filter([wall, floor, other_level])
  end

  def test_matches_legacy_string_level_reference
    wall = ObjectStub.new('architecture.wall', ['level-legacy'])
    filter = Filter.new(object_types: ['architecture.wall'], level_id: 'level-legacy')

    assert filter.match?(wall)
  end
end
