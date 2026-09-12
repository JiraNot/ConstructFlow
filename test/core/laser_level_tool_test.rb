# frozen_string_literal: true

require_relative '../test_helper'
require 'constructflow/core/tools/laser_level_tool'

class LaserLevelToolTest < Minitest::Test
  ToolClass = JiraNot::ConstructFlow::Core::Tools::LaserLevelTool

  def test_tool_initialization
    tool = ToolClass.new
    assert_nil tool.benchmark_z_mm
    assert_nil tool.hover_point
  end

  def test_tool_set_benchmark_and_reset
    tool = ToolClass.new
    tool.benchmark_z_mm = 1000.0
    assert_in_delta 1000.0, tool.benchmark_z_mm

    # Esc key (27) resets benchmark
    tool.onKeyDown(27, 0, 0, nil)
    assert_nil tool.benchmark_z_mm
  end

  def test_tool_key_down_shift
    tool = ToolClass.new
    # Key 16 is Shift, should not raise
    tool.onKeyDown(16, 0, 0, nil)
    tool.onKeyUp(16, 0, 0, nil)
    assert true
  end
end
