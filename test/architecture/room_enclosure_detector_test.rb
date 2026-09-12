# frozen_string_literal: true

require_relative '../test_helper'

class RoomEnclosureDetectorTest < Minitest::Test
  Wall = JiraNot::ConstructFlow::Architecture::WallDefinition
  Detector = JiraNot::ConstructFlow::Architecture::RoomEnclosureDetector

  def test_detects_enclosures_from_room_bounding_wall_graph
    walls = [
      Wall.new(path_mm: [[0, 0, 0], [4000, 0, 0]]),
      Wall.new(path_mm: [[4000, 0, 0], [4000, 3000, 0]]),
      Wall.new(path_mm: [[4000, 3000, 0], [0, 3000, 0]]),
      Wall.new(path_mm: [[0, 3000, 0], [0, 0, 0]]),
      Wall.new(path_mm: [[2000, 0, 0], [2000, 3000, 0]])
    ]

    boundaries = Detector.new.detect(walls: walls)
    areas = boundaries.map { |boundary| polygon_area(boundary) }

    assert_includes areas, 6_000_000.0
    assert_includes areas, 12_000_000.0
    assert boundaries.all? { |boundary| boundary.length >= 3 }
  end

  def test_ignores_non_room_bounding_walls
    wall = Wall.new(path_mm: [[0, 0, 0], [1000, 0, 0]], room_bounding: false)

    assert_empty Detector.new.detect(walls: [wall])
  end

  private

  def polygon_area(points)
    points.each_with_index.sum do |point, index|
      other = points[(index + 1) % points.length]
      (point[0] * other[1]) - (other[0] * point[1])
    end.abs / 2.0
  end
end
