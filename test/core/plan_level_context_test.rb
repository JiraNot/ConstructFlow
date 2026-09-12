# frozen_string_literal: true

require_relative '../test_helper'

class PlanLevelContextTest < Minitest::Test
  Context = JiraNot::ConstructFlow::Core::PlanLevelContext
  Level = Struct.new(:elevation_mm)

  Levels = Struct.new(:values) do
    def fetch(id)
      values.fetch(id)
    end
  end
  Runtime = Struct.new(:levels)

  def test_projects_plan_point_to_registered_level_elevation
    context = Context.new(Runtime.new(Levels.new({ 'level.2' => Level.new(3200.0) })), 'level.2')

    assert_equal [100.0, 200.0, 3200.0], context.project([100.0, 200.0, 0.0])
    assert_equal 'level.2', context.level_id
  end

  def test_preserves_point_when_level_is_unregistered_or_unresolved
    context = Context.new(Runtime.new(Levels.new({})), 'missing')
    point = [100.0, 200.0, 50.0]

    assert_equal point, context.project(point)
  end

  def test_empty_level_context_preserves_cursor_z
    context = Context.new(Runtime.new(Levels.new({})))

    assert_equal [100.0, 200.0, 50.0], context.project([100.0, 200.0, 50.0])
  end

  def test_projects_to_level_datum_plus_base_offset
    context = Context.new(Runtime.new(Levels.new({ 'level.2' => Level.new(3200.0) })), 'level.2', offset_mm: 125)

    assert_equal [100.0, 200.0, 3325.0], context.project([100.0, 200.0, 0.0])
  end
end
