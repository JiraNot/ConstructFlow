# frozen_string_literal: true

require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/core/entity_guard'
require_relative '../../apps/sketchup-extension/constructflow/core/geometry_guard'

class SafetyGuardsTest < Minitest::Test
  FakeEntity = Struct.new(:deleted_value, :valid_value) do
    def deleted? = deleted_value
    def valid? = valid_value
  end

  def test_entity_guard_rejects_nil_deleted_and_invalid_entities
    refute JiraNot::ConstructFlow::Core::EntityGuard.usable?(nil)
    refute JiraNot::ConstructFlow::Core::EntityGuard.usable?(FakeEntity.new(true, true))
    refute JiraNot::ConstructFlow::Core::EntityGuard.usable?(FakeEntity.new(false, false))
    assert JiraNot::ConstructFlow::Core::EntityGuard.usable?(FakeEntity.new(false, true))
  end

  def test_geometry_guard_rejects_non_finite_and_degenerate_values
    guard = JiraNot::ConstructFlow::Core::GeometryGuard
    assert_raises(ArgumentError) { guard.finite_number!(Float::INFINITY) }
    assert_raises(ArgumentError) { guard.positive_mm!(0) }
    assert_raises(ArgumentError) { guard.distinct_points!([0, 0, 0], [0, 0, 0]) }
    assert_equal [[0.0, 0.0, 0.0], [10.0, 0.0, 0.0]], guard.distinct_points!([0, 0, 0], [10, 0, 0])
  end
end
