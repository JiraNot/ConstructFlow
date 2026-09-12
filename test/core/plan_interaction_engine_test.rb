# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'plan_interaction_engine')

class PlanInteractionEngineTest < Minitest::Test
  Engine = JiraNot::ConstructFlow::Core::PlanInteractionEngine

  def setup
    @engine = Engine.new(snap_tolerance_mm: 75)
  end

  def test_snaps_to_endpoint_and_reports_snap_kind
    result = @engine.snap([1005, 20, 0], references: [{ path_mm: [[1000, 0, 0], [2000, 0, 0]] }])

    assert_equal [1000.0, 0.0, 0.0], result[:point_mm]
    assert_equal 'endpoint', result[:kind]
    assert_in_delta 20.6155, result[:distance_mm], 0.001
  end

  def test_snaps_to_segment_midpoint
    result = @engine.snap([1490, 8, 0], references: [{ path_mm: [[1000, 0, 0], [2000, 0, 0]] }])

    assert_equal [1500.0, 0.0, 0.0], result[:point_mm]
    assert_equal 'midpoint', result[:kind]
  end

  def test_snaps_to_nearest_position_on_reference_segment
    result = @engine.snap([1800, 40, 0], references: [{
      path_mm: [[0, 0, 0], [4000, 0, 0]], source_object_id: 'wall-1', source_type: 'architecture.wall'
    }])

    assert_equal [1800.0, 0.0, 0.0], result[:point_mm]
    assert_equal 'reference', result[:kind]
    assert_equal 'wall-1', result[:source_object_id]
  end

  def test_explicit_midpoint_snap_has_priority_over_reference_projection
    result = @engine.snap([1990, 8, 0], references: [{
      path_mm: [[0, 0, 0], [4000, 0, 0]], source_object_id: 'wall-1'
    }])

    assert_equal [2000.0, 0.0, 0.0], result[:point_mm]
    assert_equal 'midpoint', result[:kind]
  end

  def test_snaps_to_intersection_between_reference_segments
    result = @engine.snap([1980, 2020, 0], references: [
      { path_mm: [[0, 2000, 0], [4000, 2000, 0]] },
      { path_mm: [[2000, 0, 0], [2000, 4000, 0]] }
    ])

    assert_equal [2000.0, 2000.0, 0.0], result[:point_mm]
    assert_equal 'intersection', result[:kind]
  end

  def test_snaps_to_multiple_reference_points_for_column_faces
    result = @engine.snap([1055, 0, 0], references: [
      { points_mm: [[1000, 0, 0], [1100, 0, 0]], kind: 'column_face' }
    ])

    assert_equal [1100.0, 0.0, 0.0], result[:point_mm]
    assert_equal 'column_face', result[:kind]
  end

  def test_snap_preserves_traceable_reference_identity
    result = @engine.snap([1000, 20, 0], references: [{
      path_mm: [[1000, 0, 0], [2000, 0, 0]], source_object_id: 'wall-1', source_type: 'architecture.wall'
    }])

    assert_equal 'wall-1', result[:source_object_id]
    assert_equal 'architecture.wall', result[:source_type]
  end

  def test_planar_snap_ignores_level_offset_but_returns_candidate_elevation
    result = @engine.snap([1000, 20, 0], references: [{
      path_mm: [[1000, 0, 500], [2000, 0, 500]], source_object_id: 'wall-offset'
    }])

    assert_equal [1000.0, 0.0, 500.0], result[:point_mm]
    assert_in_delta 20.0, result[:distance_mm], 0.001
    assert_equal 'wall-offset', result[:source_object_id]
  end

  def test_non_planar_snap_can_be_requested_for_three_dimensional_distance
    engine = Engine.new(snap_tolerance_mm: 75, planar: false)

    result = engine.snap([1000, 20, 0], references: [{ path_mm: [[1000, 0, 500], [2000, 0, 500]] }])

    assert_equal 'free', result[:kind]
    assert_in_delta Math.sqrt(20**2 + 500**2), result[:distance_mm], 0.001
  end

  def test_equal_distance_snap_is_stable_when_reference_order_changes
    references = [
      { point_mm: [1000, 0, 0], source_object_id: 'wall-z' },
      { point_mm: [1000, 0, 0], source_object_id: 'wall-a' }
    ]

    first = @engine.snap([1000, 20, 0], references: references)
    second = @engine.snap([1000, 20, 0], references: references.reverse)

    assert_equal 'wall-a', first[:source_object_id]
    assert_equal first, second
  end

  def test_intersections_include_multiple_reference_paths
    result = @engine.snap([500, 5, 0], references: [
      { paths_mm: [[[0, 0, 0], [1000, 0, 0]], [[0, 100, 0], [1000, 100, 0]]], source_object_id: 'wall-1', source_type: 'architecture.wall' },
      { path_mm: [[500, -100, 0], [500, 200, 0]], source_object_id: 'grid-1', source_type: 'structure.grid' }
    ])

    assert_equal [500.0, 0.0, 0.0], result[:point_mm]
    assert_equal 'intersection', result[:kind]
    assert_equal %w[grid-1 wall-1], result[:source_object_ids].sort
    assert_equal %w[architecture.wall structure.grid], result[:source_types].sort
  end

  def test_wall_reference_paths_keep_endpoint_priority
    result = @engine.snap([1000, 20, 0], references: [{
      paths_mm: [
        [[1000, 0, 0], [2000, 0, 0]],
        [[1000, 100, 0], [2000, 100, 0]]
      ],
      kind: 'wall_reference', source_object_id: 'wall-1'
    }])

    assert_equal 'endpoint', result[:kind]
    assert_equal [1000.0, 0.0, 0.0], result[:point_mm]
  end

  def test_orthogonal_constraint_chooses_dominant_axis
    result = @engine.segment_preview([0, 0, 0], [900, 300, 0])

    assert_equal [900.0, 0.0, 0.0], result[:finish_mm]
    assert_equal 900.0, result[:length_mm]
    assert_equal 'orthogonal', result[:constraint]
  end

  def test_free_mode_preserves_diagonal_input
    result = @engine.segment_preview([0, 0, 0], [300, 400, 0], mode: :free)

    assert_equal [300.0, 400.0, 0.0], result[:finish_mm]
    assert_in_delta 500.0, result[:length_mm], 0.001
  end

  def test_plan_segment_keeps_the_starting_elevation
    result = @engine.segment_preview([0, 0, 250], [300, 400, 900], mode: :free)

    assert_equal [300.0, 400.0, 250.0], result[:finish_mm]
  end

  def test_rejects_invalid_point
    assert_raises(ArgumentError) { @engine.snap([1, 2]) }
  end

  def test_parses_numeric_distances_and_applies_exact_length
    assert_equal 2500.0, @engine.numeric_distance_mm('2.5m')
    assert_equal 304.8, @engine.numeric_distance_mm('1 ft')
    result = @engine.segment_preview([0, 0, 0], [900, 300, 0], length_mm: 1200)

    assert_equal [1200.0, 0.0, 0.0], result[:finish_mm]
    assert_equal 1200.0, result[:length_mm]
  end

  def test_supports_parallel_and_perpendicular_reference_inference
    parallel = @engine.segment_preview(
      [0, 0, 0], [500, 300, 0], mode: :parallel,
      reference_segment: [[100, 100, 0], [100, 1100, 0]]
    )
    perpendicular = @engine.segment_preview(
      [0, 0, 0], [500, 300, 0], mode: :perpendicular,
      reference_segment: [[100, 100, 0], [1100, 100, 0]]
    )

    assert_equal [0.0, 300.0, 0.0], parallel[:finish_mm]
    assert_equal [0.0, 300.0, 0.0], perpendicular[:finish_mm]
  end

  def test_reports_shared_placement_feedback_states
    host = Struct.new(:id).new('wall-1')

    assert_equal 'no_host', @engine.placement_feedback(host: nil, candidate: nil)[:state]
    assert_equal 'valid', @engine.placement_feedback(host: host, candidate: { x: 1 })[:state]
    invalid = @engine.placement_feedback(host: host, candidate: {}, errors: ['outside host'])
    assert_equal 'invalid', invalid[:state]
    assert_equal ['outside host'], invalid[:errors]
  end

  def test_supports_explicit_axis_lock_constraints
    red = @engine.segment_preview([0, 0, 0], [500, 300, 0], mode: :red)
    green = @engine.segment_preview([0, 0, 0], [500, 300, 0], mode: :green)
    blue = @engine.segment_preview([0, 0, 0], [500, 300, 400], mode: :blue)

    assert_equal [500.0, 0.0, 0.0], red[:finish_mm]
    assert_equal [0.0, 300.0, 0.0], green[:finish_mm]
    assert_equal [0.0, 0.0, 400.0], blue[:finish_mm]
  end

  def test_parses_comma_formatted_distances
    assert_equal 3500.0, @engine.numeric_distance_mm('3,500 mm')
    assert_equal 10000.0, @engine.numeric_distance_mm('10,000')
  end
end
