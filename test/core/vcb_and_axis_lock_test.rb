# frozen_string_literal: true

require_relative '../test_helper'

module Sketchup
  unless const_defined?(:InputPoint)
    class InputPoint
      attr_accessor :position
      def initialize(pos = Geom::Point3d.new(0, 0, 0))
        @position = pos
      end
      def pick(_view, _x, _y, _anchor = nil); true; end
      def valid?; true; end
    end
  end

  unless respond_to?(:set_status_text)
    class << self
      attr_accessor :status_text
      def set_status_text(text, _pos = nil)
        @status_text = text
      end
    end
  end
end

require_relative '../../apps/sketchup-extension/constructflow/core/plan_interaction_engine'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/tools/wall_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/tools/wall_edit_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/tools/beam_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/tools/grid_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/electrical/tools/conduit_tool'

class VcbAndAxisLockTest < Minitest::Test
  def setup
    @commands = Class.new do
      attr_reader :executed

      def initialize
        @executed = []
      end

      def execute(name, params = {}, project_id: nil)
        @executed << { name: name, params: params, project_id: project_id }
        { status: 'success' }
      end
    end.new

    @levels = Class.new do
      def fetch(_id)
        Struct.new(:elevation_mm).new(0.0)
      end
    end.new

    @runtime = Struct.new(:commands, :project, :levels).new(
      @commands,
      Struct.new(:project_id).new('test-project'),
      @levels
    )
  end

  def test_wall_tool_enables_vcb_and_arrow_keys
    tool = JiraNot::ConstructFlow::Architecture::Tools::WallTool.new(
      runtime: @runtime, thickness_mm: 200, height_mm: 2800
    )

    assert tool.enableVCB?

    view = Class.new { def invalidate; end }.new

    # Arrow keys toggle axis
    tool.onKeyDown(39, false, 0, view) # Right -> Red
    assert_equal :red, tool.instance_variable_get(:@locked_axis)

    tool.onKeyDown(37, false, 0, view) # Left -> Green
    assert_equal :green, tool.instance_variable_get(:@locked_axis)

    tool.onKeyDown(38, false, 0, view) # Up -> Blue
    assert_equal :blue, tool.instance_variable_get(:@locked_axis)

    tool.onKeyDown(40, false, 0, view) # Down -> Unlock
    assert_nil tool.instance_variable_get(:@locked_axis)
  end

  def test_wall_tool_vcb_typing_commits_wall_segment_when_started
    tool = JiraNot::ConstructFlow::Architecture::Tools::WallTool.new(
      runtime: @runtime, thickness_mm: 200, height_mm: 2800
    )
    view = Class.new { def invalidate; end }.new

    # Simulate start point at [0, 0, 0]
    tool.instance_variable_set(:@start_point, [0.0, 0.0, 0.0])
    tool.instance_variable_set(:@hover_point, Geom::Point3d.new(100.0, 0, 0))

    # User types 3000 mm and hits Enter
    tool.onUserText('3000 mm', view)

    assert_equal 1, @commands.executed.length
    cmd = @commands.executed.first
    assert_equal 'CreateWall', cmd[:name]
    assert_equal [[0.0, 0.0, 0.0], [3000.0, 0.0, 0.0]], cmd[:params][:path_mm]
    assert_equal [3000.0, 0.0, 0.0], tool.instance_variable_get(:@start_point)
  end

  def test_wall_tool_vcb_typing_with_red_axis_lock
    tool = JiraNot::ConstructFlow::Architecture::Tools::WallTool.new(
      runtime: @runtime, thickness_mm: 200, height_mm: 2800
    )
    view = Class.new { def invalidate; end }.new

    tool.instance_variable_set(:@start_point, [1000.0, 500.0, 0.0])
    tool.onKeyDown(39, false, 0, view) # Lock Red axis
    tool.onUserText('2500', view)

    cmd = @commands.executed.first
    assert_equal 'CreateWall', cmd[:name]
    assert_equal [[1000.0, 500.0, 0.0], [3500.0, 500.0, 0.0]], cmd[:params][:path_mm]
  end

  def test_wall_tool_vcb_typing_with_green_axis_lock
    tool = JiraNot::ConstructFlow::Architecture::Tools::WallTool.new(
      runtime: @runtime, thickness_mm: 200, height_mm: 2800
    )
    view = Class.new { def invalidate; end }.new

    tool.instance_variable_set(:@start_point, [1000.0, 500.0, 0.0])
    tool.onKeyDown(37, false, 0, view) # Lock Green axis
    tool.onUserText('4000 mm', view)

    cmd = @commands.executed.first
    assert_equal 'CreateWall', cmd[:name]
    assert_equal [[1000.0, 500.0, 0.0], [1000.0, 4500.0, 0.0]], cmd[:params][:path_mm]
  end

  def test_beam_tool_vcb_typing_and_axis_lock
    tool = JiraNot::ConstructFlow::Structure::Tools::BeamTool.new(runtime: @runtime)
    assert tool.enableVCB?

    view = Class.new { def invalidate; end }.new
    tool.instance_variable_set(:@start_mm, [0.0, 0.0, 0.0])
    tool.onKeyDown(39, false, 0, view) # Lock Red
    tool.onUserText('5000 mm', view)

    cmd = @commands.executed.first
    assert_equal 'CreateBeam', cmd[:name]
    assert_equal [[0.0, 0.0, 0.0], [5000.0, 0.0, 0.0]], cmd[:params][:path_mm]
  end

  def test_grid_tool_vcb_typing_and_axis_lock
    tool = JiraNot::ConstructFlow::Structure::Tools::GridTool.new(runtime: @runtime, name: 'A')
    assert tool.enableVCB?

    view = Class.new { def invalidate; end }.new
    tool.instance_variable_set(:@start_mm, [0.0, 0.0, 0.0])
    tool.onKeyDown(37, false, 0, view) # Lock Green
    tool.onUserText('6000 mm', view)

    cmd = @commands.executed.first
    assert_equal 'CreateStructuralGrid', cmd[:name]
    assert_equal [[0.0, 0.0, 0.0], [0.0, 6000.0, 0.0]], cmd[:params][:path_mm]
  end
end
