# frozen_string_literal: true

require_relative '../test_helper'

class SlopeDefinitionTest < Minitest::Test
  Surface = JiraNot::ConstructFlow::Surface

  def test_planar_slope_with_control_points
    # 3 points forming a plane tilted along X: elevation drops 10mm per 1000mm
    p1 = { 'point_mm' => [0, 0, 100], 'elevation_mm' => 100.0 }
    p2 = { 'point_mm' => [1000, 0, 90], 'elevation_mm' => 90.0 }
    p3 = { 'point_mm' => [0, 1000, 100], 'elevation_mm' => 100.0 }

    slope = Surface::SlopeDefinition.new(
      slope_mode: 'planar',
      control_points: [p1, p2, p3]
    )

    assert slope.valid?
    assert_in_delta 100.0, slope.elevation_at([0, 0]), 0.01
    assert_in_delta 90.0, slope.elevation_at([1000, 0]), 0.01
    assert_in_delta 95.0, slope.elevation_at([500, 0]), 0.01
    assert_in_delta 95.0, slope.elevation_at([500, 500]), 0.01
  end

  def test_drain_to_slope_calculation
    slope = Surface::SlopeDefinition.new(
      slope_mode: 'drain_to',
      drain_target_id: 'drain-gully-1',
      target_point_mm: [500, 500, 0],
      slope_percentage: 2.0 # 2% slope rising away from drain
    )

    assert slope.valid?
    # At center (drain point), elevation is 0
    assert_in_delta 0.0, slope.elevation_at([500, 500]), 0.01
    # 1000mm away, elevation rises by 20mm (2% of 1000)
    assert_in_delta 20.0, slope.elevation_at([1500, 500]), 0.01
  end

  def test_collinear_control_points_rejected
    p1 = { 'point_mm' => [0, 0, 0], 'elevation_mm' => 0.0 }
    p2 = { 'point_mm' => [100, 100, 0], 'elevation_mm' => 1.0 }
    p3 = { 'point_mm' => [200, 200, 0], 'elevation_mm' => 2.0 }

    slope = Surface::SlopeDefinition.new(
      slope_mode: 'multi_point',
      control_points: [p1, p2, p3]
    )

    refute slope.valid?
    assert slope.errors.any? { |err| err.include?('collinear') }
  end

  def test_serialization_round_trip
    slope = Surface::SlopeDefinition.new(
      slope_mode: 'drain_to',
      drain_target_id: 'drain-1',
      target_point_mm: [100, 200, 50],
      slope_percentage: 1.5
    )

    data = slope.to_h
    restored = Surface::SlopeDefinition.from_h(data)

    assert_equal slope.slope_mode, restored.slope_mode
    assert_equal slope.drain_target_id, restored.drain_target_id
    assert_equal slope.slope_percentage, restored.slope_percentage
    assert_equal slope.target_point_mm, restored.target_point_mm
  end
end
