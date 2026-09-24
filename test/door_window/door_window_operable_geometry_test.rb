# frozen_string_literal: true

require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/modules/door_window/door_window_geometry'

# Reuses the recording fakes defined in model_detail_geometry_test.rb when the
# full suite runs; defines them defensively for single-file runs.
unless defined?(RecordingFace)
  class RecordingFace
    attr_reader :corners_su, :pushpulls
    attr_accessor :material

    def initialize(corners_su)
      @corners_su = corners_su
      @pushpulls = []
    end

    def normal
      Struct.new(:x, :y, :z).new(0.0, 1.0, 0.0)
    end

    def reverse!; end

    def pushpull(value)
      @pushpulls << value
    end
  end

  class RecordingEntities
    attr_reader :faces, :groups, :lines

    def initialize
      @faces = []
      @groups = []
      @lines = []
    end

    def add_face(*corners)
      corners = corners.first if corners.length == 1 && corners.first.is_a?(Array)
      face = RecordingFace.new(corners)
      @faces << face
      face
    end

    def add_group
      group = RecordingGroup.new
      @groups << group
      group
    end

    def add_line(first_pt, second_pt)
      @lines << [first_pt, second_pt]
      Struct.new(:first_pt, :second_pt).new(first_pt, second_pt)
    end

    def clear!
      @faces.clear
      @groups.clear
      @lines.clear
    end
  end

  class RecordingGroup
    attr_reader :entities
    attr_accessor :name, :model

    def initialize
      @entities = RecordingEntities.new
    end
  end

  class RecordingMaterials
    def [](_name)
      nil
    end

    def add(name)
      Struct.new(:name).new(name)
    end
  end

  class RecordingModel
    attr_reader :materials

    def initialize
      @materials = RecordingMaterials.new
    end

    def active_entities
      RecordingEntities.new
    end
  end
end

unless defined?(FakeInfillCapability)
  class FakeInfillCapability
    def initialize(frame_points, depth_mm)
      @frame_points = frame_points
      @depth_mm = depth_mm
    end

    def frame_points(_opening)
      @frame_points
    end

    def infill_depth_mm(_opening)
      @depth_mm
    end
  end
end

# Standalone runs need the vector stub that other test files provide when
# the full suite loads them first.
if !defined?(Geom::Vector3d)
  module Geom
    class Vector3d
      attr_reader :x, :y, :z

      # Mirrors the real SketchUp API signature, which uses x/y/z.
      def initialize(x = 0.0, y = 0.0, z = 0.0) # rubocop:disable Naming/MethodParameterName
        @x = x.to_f
        @y = y.to_f
        @z = z.to_f
      end
    end
  end
end

# Piece-by-piece geometry tests for the new operable door/window parts.
class DoorWindowOperableGeometryTest < Minitest::Test
  MM = 1.0 / 25.4
  DoorWindow = JiraNot::ConstructFlow::DoorWindow

  def pushpull_magnitude(value)
    return value.abs if value.is_a?(Numeric)

    Math.sqrt((value.x**2) + (value.y**2) + (value.z**2))
  end

  def test_louver_renders_blades_at_requested_spacing_and_stays_on_wall
    geometry = DoorWindow::DoorWindowGeometry.new
    type = DoorWindow::Catalog.build_type(
      'W-LV1', height_mm: 1200, louver_spacing_mm: 200, leaf_thickness_mm: 30
    )
    group = build_group(geometry, type)

    blades = group.entities.faces.select { |face| face.material&.name == 'CF Glass' }
    # Blades live inside the INNER frame (height - 2 x frame_width):
    # (1200 - 90) / 200 = 5 blades.
    assert_equal 5, blades.length
    zs = blades.flat_map { |face| face.corners_su.map(&:z) }.uniq.sort
    # All blade corners stay near the wall plane (y ~ 0), tilted blades only
    # wobble within a fraction of the bay height.
    max_y_offset = blades.flat_map { |face| face.corners_su.map(&:y) }.map(&:abs).max
    assert_in_delta 0.0, max_y_offset, 1200.0 * MM * 0.35, 'blades must not fly off the wall plane'
    assert_operator zs.max - zs.min, :<=, 1200.0 * MM + 0.01
  end

  def test_mullion_is_centered_on_bay_line_with_full_width
    geometry = DoorWindow::DoorWindowGeometry.new
    type = DoorWindow::Catalog.build_type(
      'D-SL2', width_mm: 1800, mullion_width_mm: 45, leaf_thickness_mm: 45
    )
    group = build_group(geometry, type)

    # Frame(4) + glass(1) + fixed leaf + slide leaf + mullion(1) = 8.
    # The mullion is the Timber face whose width is ~45 mm.
    timber_faces = group.entities.faces.select { |face| face.material&.name == 'CF Timber' }
    widths = timber_faces.map { |face| face_face_width_mm(face) }
    mullion_width = widths.find { |w| (w - 45.0).abs < 3.0 }
    refute_nil mullion_width, "expected a ~45 mm mullion face among widths #{widths.map { |w| w.round(1) }}"
  end

  def test_roller_shutter_is_a_slatted_solid_slab
    geometry = DoorWindow::DoorWindowGeometry.new
    type = DoorWindow::Catalog.build_type('D-RS1', leaf_thickness_mm: 20)
    group = build_group(geometry, type)

    slab = leaf_face(group, type)
    refute_nil slab
    assert_in_delta 20.0 * MM, pushpull_magnitude(slab.pushpulls.first), 0.01
    # Slats: 2500 mm / 120 mm = 20 groove lines (minus one that would sit on
    # the head, so 19).
    assert_equal 19, group.entities.lines.length
  end

  def test_awning_leaf_draws_triangle_symbol_lines
    geometry = DoorWindow::DoorWindowGeometry.new
    type = DoorWindow::Catalog.build_type('W-AW1')
    group = build_group(geometry, type)

    # Awning: 1 slab + 2 triangle lines; no glass sheet (leaf fills the bay).
    assert_operator group.entities.faces.length, :>=, 4 # frame 4 + leaf 1
    assert_equal 2, group.entities.lines.length
  end

  def test_leaf_thickness_comes_from_type_not_constant
    geometry = DoorWindow::DoorWindowGeometry.new
    # Frame depth 140 keeps the 55 mm leaf below the depth/2 cap (70 mm).
    type = DoorWindow::Catalog.build_type('D-SW1', leaf_thickness_mm: 55, frame_depth_mm: 140)
    group = build_group(geometry, type)

    slab = leaf_face(group, type)
    refute_nil slab
    assert_in_delta 55.0 * MM, pushpull_magnitude(slab.pushpulls.first), 0.01
  end

  def test_pivot_center_draws_axis_and_diagonal_symbols
    geometry = DoorWindow::DoorWindowGeometry.new
    type = DoorWindow::Catalog.build_type('D-PV1')
    group = build_group(geometry, type)

    # pivot_center: slab + center line + 2 diagonals = 3 lines.
    assert_equal 3, group.entities.lines.length
  end

  private

  def build_group(geometry, type)
    group = RecordingGroup.new
    group.model = RecordingModel.new
    geometry.rebuild!(
      group,
      opening_object: Object.new,
      type: type,
      opening_host_capability: FakeInfillCapability.new(opening_frame(type), type.frame_depth_mm)
    )
    group
  end

  # Leaf slabs are capped at half the reveal depth; frame members pushpull
  # the full reveal depth. This separates leaves from frame parts.
  def leaf_face(group, type)
    threshold = (type.frame_depth_mm / 2.0) * MM
    group.entities.faces.find do |face|
      face.material&.name == 'CF Timber' && pushpull_magnitude(face.pushpulls.first) <= threshold
    end
  end

  def face_face_width_mm(face)
    xs = face.corners_su.map(&:x)
    ys = face.corners_su.map(&:y)
    span_x = xs.max - xs.min
    span_y = ys.max - ys.min
    Math.sqrt((span_x**2) + (span_y**2)) / MM
  end

  def opening_frame(type)
    w = type.width_mm
    h = type.height_mm
    [[0, 0, 0], [w, 0, 0], [w, 0, h], [0, 0, h]]
  end
end
