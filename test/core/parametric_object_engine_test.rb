# frozen_string_literal: true

require_relative '../test_helper'

class ParametricObjectEngineTest < Minitest::Test
  Engine = JiraNot::ConstructFlow::Core::ParametricObjectEngine
  ConstraintGraph = JiraNot::ConstructFlow::Core::ConstraintGraph

  def test_resolves_type_instance_and_formula_parameters_deterministically
    engine = Engine.new(
      type_parameters: { 'width' => 900, 'height' => 2100 },
      formulas: { 'clear_width' => 'width - (2 * frame)', 'clear_area' => 'clear_width * height' }
    )

    resolved = engine.resolve(instance_parameters: { 'frame' => 50 })

    assert_equal 800.0, resolved['clear_width']
    assert_equal 1_680_000.0, resolved['clear_area']
  end

  def test_rejects_cyclic_formulas_without_evaluating_arbitrary_code
    engine = Engine.new(formulas: { 'a' => 'b + 1', 'b' => 'a + 1' })

    assert_includes engine.validate, 'cyclic formula dependency: a'
  end

  def test_rejects_unknown_dependency_and_division_by_zero
    unknown = Engine.new(formulas: { 'clear' => 'width - reveal' })
    zero = Engine.new(type_parameters: { 'width' => 10, 'zero' => 0 }, formulas: { 'ratio' => 'width / zero' })

    assert_includes unknown.validate, 'unknown formula dependency: reveal'
    assert_includes zero.validate, 'formula division by zero'
  end

  def test_constraint_graph_returns_dependency_safe_order
    graph = ConstraintGraph.new
    graph.add(source: 'wall.endpoint', target: 'door.offset', kind: 'host')
    graph.add(source: 'door.offset', target: 'schedule.row', kind: 'schedule')

    assert_equal ['wall.endpoint', 'door.offset', 'schedule.row'], graph.order
  end

  def test_constraint_graph_rejects_cycles
    graph = ConstraintGraph.new
    graph.add(source: 'a', target: 'b')
    graph.add(source: 'b', target: 'a')

    assert_includes graph.validate, 'cyclic constraint dependency: a'
  end
end
