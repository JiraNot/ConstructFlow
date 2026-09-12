# frozen_string_literal: true

require_relative '../test_helper'

class ConstraintEngineTest < Minitest::Test
  Engine = JiraNot::ConstructFlow::Core::ConstraintEngine

  def test_applies_align_offset_center_and_level_deterministically
    result = Engine.new.solve(
      points: { 'wall' => [100, 200, 0], 'door' => [450, 800, 600], 'other' => [900, 1000, 200] },
      constraints: [
        { kind: 'align', source: 'wall', target: 'door', axis: 'x' },
        { kind: 'offset', source: 'wall', target: 'door', offset: [300, 50, 0] },
        { kind: 'centered', source: 'wall', target: 'door', other: 'other' },
        { kind: 'level', target: 'door', level_z: 1200 }
      ]
    )

    assert_equal [500.0, 600.0, 1200.0], result['door']
  end

  def test_applies_fixed_distance_and_perpendicular_projection
    result = Engine.new.solve(
      points: { 'origin' => [0, 0, 0], 'point' => [3, 4, 0] },
      constraints: [
        { kind: 'fixed_distance', source: 'origin', target: 'point', distance_mm: 10 },
        { kind: 'perpendicular', source: 'origin', target: 'point' }
      ]
    )

    assert_in_delta 10.0, Math.sqrt(result['point'].first(2).sum { |value| value**2 }), 0.0001
    assert_equal [-8.0, 6.0, 0.0], result['point']
  end

  def test_equal_constraint_matches_reference_point_distance
    result = Engine.new.solve(
      points: { 'origin' => [0, 0, 0], 'reference' => [3, 0, 0], 'target' => [0, 10, 0] },
      constraints: [{ kind: 'equal', source: 'origin', target: 'target', other: 'reference' }]
    )

    assert_equal [0.0, 3.0, 0.0], result['target']
  end

  def test_reports_invalid_kind_and_unknown_reference
    assert_equal 1, Engine.new.validate([{ kind: 'not-a-constraint', source: 'a', target: 'b' }]).length

    error = assert_raises(ArgumentError) do
      Engine.new.solve(points: { 'a' => [0, 0, 0] }, constraints: [{ kind: 'host', source: 'missing', target: 'a' }])
    end
    assert_includes error.message, 'unknown point'
  end

  def test_validates_constraint_preconditions_before_solving
    errors = Engine.new.validate([
      { kind: 'align', target: 'point' },
      { kind: 'lock', target: 'point' },
      { kind: 'centered', source: 'a', target: 'b' },
      { kind: 'equal', source: 'a', target: 'b' }
    ])

    assert_equal 4, errors.length
    assert_includes errors.map { |error| error[:message] }, 'constraint source required'
    assert_includes errors.map { |error| error[:message] }, 'lock constraint requires a fixed point'
    assert_includes errors.map { |error| error[:message] }, 'centered constraint requires other point'
    assert_includes errors.map { |error| error[:message] }, 'equal constraint requires a reference point or distance'
  end
end
