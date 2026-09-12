# frozen_string_literal: true

require_relative '../test_helper'

class GhostPreviewTest < Minitest::Test
  def setup
    @preview = JiraNot::ConstructFlow::Core::GhostPreview
  end

  def test_wall_mesh_generation
    start_pt = [0, 0, 0]
    end_pt = [3000 / 25.4, 0, 0] # 3000 mm along X in inches
    mesh = @preview.build_wall_mesh(start_pt, end_pt, 100.0, 2800.0)

    refute_nil mesh
    assert_equal :wall, mesh[:type]
    assert_equal 3000.0, mesh[:length_mm]
    assert_equal 100.0, mesh[:thickness_mm]
    assert_equal 2800.0, mesh[:height_mm]
    assert_equal 24, mesh[:wireframe_lines].size # 12 line segments * 2 points
    assert_equal 6, mesh[:faces].size # 6 bounding faces
    assert_includes mesh[:label], '3000 mm'
    assert_includes mesh[:label], '100 mm'
    assert_includes mesh[:label], '2800 mm'
  end

  def test_opening_cutout_mesh_generation
    wall_def = Struct.new(:path_mm, :thickness_mm).new(
      [[0, 0, 0], [4000, 0, 0]],
      150.0
    )
    mesh = @preview.build_opening_mesh(wall_def, 0, 1500.0, 900.0, 2100.0, 100.0)

    refute_nil mesh
    assert_equal :opening, mesh[:type]
    assert_equal 900.0, mesh[:width_mm]
    assert_equal 2100.0, mesh[:height_mm]
    assert_equal 100.0, mesh[:sill_mm]
    assert_equal 6, mesh[:faces].size
    assert_includes mesh[:label], '900 x 2100 mm'
    assert_includes mesh[:label], 'Sill: 100 mm'
  end

  def test_column_mesh_generation
    center_pt = [10, 10, 0]
    mesh = @preview.build_column_mesh(center_pt, [200.0, 200.0], 3000.0)

    refute_nil mesh
    assert_equal :column, mesh[:type]
    assert_equal [200.0, 200.0], mesh[:section_mm]
    assert_equal 3000.0, mesh[:height_mm]
    assert_equal 6, mesh[:faces].size
    assert_includes mesh[:label], '200x200 mm'
    assert_includes mesh[:label], '3000 mm'
  end

  def test_foundation_mesh_generation
    center_pt = [0, 0, 0]
    mesh = @preview.build_foundation_mesh(center_pt, [1200.0, 1200.0, 500.0])

    refute_nil mesh
    assert_equal :foundation, mesh[:type]
    assert_equal [1200.0, 1200.0, 500.0], mesh[:size_mm]
    assert_equal 6, mesh[:faces].size
    assert_includes mesh[:label], '1200x1200 mm'
    assert_includes mesh[:label], '500 mm'
  end

  def test_manhole_mesh_generation
    center_pt = [50, 50, 0]
    mesh = @preview.build_manhole_mesh(center_pt, [600.0, 600.0], 900.0)

    refute_nil mesh
    assert_equal :manhole, mesh[:type]
    assert_equal [600.0, 600.0], mesh[:size_mm]
    assert_equal 900.0, mesh[:depth_mm]
    assert_includes mesh[:label], '600x600 mm'
    assert_includes mesh[:label], '900 mm'
  end

  def test_cabinet_mesh_generation
    origin_pt = [0, 0, 0]
    mesh = @preview.build_cabinet_mesh(origin_pt, 2400.0, 850.0, 600.0, 4)

    refute_nil mesh
    assert_equal :cabinet, mesh[:type]
    assert_equal 2400.0, mesh[:width_mm]
    assert_equal 850.0, mesh[:height_mm]
    assert_equal 600.0, mesh[:depth_mm]
    assert_equal 4, mesh[:module_count]
    assert_includes mesh[:label], '2400x850x600 mm'
    assert_includes mesh[:label], '4 ช่อง'
  end

  def test_wardrobe_mesh_generation
    origin_pt = [0, 0, 0]
    mesh = @preview.build_wardrobe_mesh(origin_pt, 1800.0, 2400.0, 600.0, 'sliding')

    refute_nil mesh
    assert_equal :wardrobe, mesh[:type]
    assert_equal 1800.0, mesh[:width_mm]
    assert_equal 2400.0, mesh[:height_mm]
    assert_includes mesh[:label], 'บานเลื่อน'
  end

  def test_pipe_mesh_generation
    start_pt = [0, 0, 0]
    end_pt = [100, 0, -2] # slope downwards
    mesh = @preview.build_pipe_mesh(start_pt, end_pt, 150.0)

    refute_nil mesh
    assert_equal :pipe, mesh[:type]
    assert_equal 150.0, mesh[:diameter_mm]
    assert_equal 2.0, mesh[:slope_pct] # 2 / 100 * 100% = 2.0%
    assert_includes mesh[:label], 'Ø150 mm'
    assert_includes mesh[:label], 'Slope 2.0%'
  end

  def test_conduit_mesh_generation
    start_pt = [0, 0, 0]
    end_pt = [100, 50, 0]
    mesh = @preview.build_conduit_mesh(start_pt, end_pt, 2700.0)

    refute_nil mesh
    assert_equal :conduit, mesh[:type]
    assert_equal 6, mesh[:wireframe_lines].size
    assert_includes mesh[:label], '2700 mm'
  end

  def test_asset_mesh_generation
    origin_pt = [0, 0, 0]
    mesh = @preview.build_asset_mesh(origin_pt, 'desk.executive', [1600.0, 800.0, 750.0], 45.0)

    refute_nil mesh
    assert_equal :asset, mesh[:type]
    assert_includes mesh[:label], 'desk.executive'
    assert_includes mesh[:label], '45°'
  end

  def test_render_ghost_with_mock_view
    view_mock = Class.new do
      attr_accessor :drawing_color, :line_width, :line_stipple
      attr_reader :drawn_calls, :text_calls

      def initialize
        @drawn_calls = []
        @text_calls = []
      end

      def draw(mode, points)
        @drawn_calls << [mode, points]
      end

      def draw_text(point, text)
        @text_calls << [point, text]
      end

      def screen_coords(point)
        point
      end
    end.new

    mesh = @preview.build_column_mesh([0, 0, 0], [200.0, 200.0], 2800.0)
    @preview.render_ghost(
      view_mock,
      mesh,
      face_color: [50, 150, 250, 80],
      line_color: [40, 120, 220]
    )

    refute_empty view_mock.drawn_calls
    refute_empty view_mock.text_calls
    assert_equal mesh[:label], view_mock.text_calls.first[1]
  end
end
