# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/validators/drainage_validator')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/route_planner')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/route_candidate_evaluator')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/route_alternative_planner')

DrainageObstacleObject = Struct.new(:id, :type)

class DrainageObstacleCapability
  def initialize(boxes)
    @boxes = boxes
  end

  def compatible?(object)
    @boxes.key?(object.id)
  end

  def bounding_box_mm(object)
    @boxes.fetch(object.id)
  end
end

class DrainageObstacleCapabilities
  def initialize(capability)
    @capability = capability
  end

  def fetch(id)
    raise KeyError, id unless id == 'structure.coordination'
    @capability
  end
end

class DrainageObstacleObjects
  def initialize(objects)
    @objects = objects
  end

  def all
    @objects
  end
end

class DrainageAlternativeRuntime
  attr_reader :capabilities, :smart_objects

  def initialize(objects:, boxes:)
    @smart_objects = DrainageObstacleObjects.new(objects)
    @capabilities = DrainageObstacleCapabilities.new(DrainageObstacleCapability.new(boxes))
  end
end

class DrainageRouteAlternativePlannerTest < Minitest::Test
  def connector(position, invert)
    { 'position_mm' => position, 'properties' => { 'invert_mm' => invert } }
  end

  def test_recommends_clear_y_first_candidate_when_x_first_hits_structure
    footing = DrainageObstacleObject.new('footing-1', 'structure.foundation')
    runtime = DrainageAlternativeRuntime.new(
      objects: [footing],
      boxes: {
        'footing-1' => { min: [1800, -100, 800], max: [2200, 100, 1100] }
      }
    )
    planner = JiraNot::ConstructFlow::Drainage::RouteAlternativePlanner.new(runtime: runtime)

    result = planner.alternatives(
      start_connector: connector([0, 0, 1000], 1000),
      end_connector: connector([4000, 4000, 900], 900)
    )

    x_first = result['candidates'].find { |item| item['id'] == 'x_first' }
    y_first = result['candidates'].find { |item| item['id'] == 'y_first' }
    refute x_first['evaluation']['clear']
    assert_equal 'footing-1', x_first['evaluation']['clashes'].first['object_id']
    assert y_first['evaluation']['clear']
    assert_equal 'y_first', result['recommended_id']
    refute result['requires_manual']
  end

  def test_requires_manual_when_both_orthogonal_candidates_clash
    footing_a = DrainageObstacleObject.new('footing-a', 'structure.foundation')
    footing_b = DrainageObstacleObject.new('footing-b', 'structure.foundation')
    runtime = DrainageAlternativeRuntime.new(
      objects: [footing_a, footing_b],
      boxes: {
        'footing-a' => { min: [1800, -100, 800], max: [2200, 100, 1100] },
        'footing-b' => { min: [-100, 1800, 800], max: [100, 2200, 1100] }
      }
    )
    planner = JiraNot::ConstructFlow::Drainage::RouteAlternativePlanner.new(runtime: runtime)

    result = planner.alternatives(
      start_connector: connector([0, 0, 1000], 1000),
      end_connector: connector([4000, 4000, 900], 900)
    )

    assert_nil result['recommended_id']
    assert result['requires_manual']
    assert_equal 'manual_intervention_required', result['status']
  end
end
