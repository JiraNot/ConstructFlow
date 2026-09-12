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

require_relative '../../apps/sketchup-extension/constructflow/core/units'
require_relative '../../apps/sketchup-extension/constructflow/core/plan_interaction_engine'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/tools/column_tool'

module JiraNot
  module ConstructFlow
    class UnitsMeterModeTest < Minitest::Test
      def setup
        @engine = Core::PlanInteractionEngine.new
      end

      def test_units_conversion_helpers
        assert_equal 3500.0, Core::Units.m_to_mm(3.5)
        assert_equal 2.8, Core::Units.mm_to_m(2800.0)
        assert_equal '3.50 m', Core::Units.format_length(3500.0, unit: :meter)
        assert_equal '2800 mm', Core::Units.format_length(2800.0, unit: :mm)
      end

      def test_numeric_distance_meter_inputs
        # Floating point meters without suffix
        assert_equal 3500.0, @engine.numeric_distance_mm('3.5')
        assert_equal 1200.0, @engine.numeric_distance_mm('1.2')
        assert_equal 200.0, @engine.numeric_distance_mm('0.2')
        assert_equal 4000.0, @engine.numeric_distance_mm('4')

        # Explicit unit tags
        assert_equal 2500.0, @engine.numeric_distance_mm('2.5m')
        assert_equal 2500.0, @engine.numeric_distance_mm('2.5 m')
        assert_equal 3500.0, @engine.numeric_distance_mm('3500mm')
        assert_equal 3500.0, @engine.numeric_distance_mm('3,500 mm')

        # Large numbers (>= 50) treated as mm for backwards compatibility
        assert_equal 10000.0, @engine.numeric_distance_mm('10,000')
        assert_equal 3000.0, @engine.numeric_distance_mm('3000')
      end

      def test_column_tool_accepts_meter_and_millimeter_inputs
        rt = Struct.new(:levels, :active_model).new({ '1FL' => Struct.new(:id, :elevation_mm).new('1FL', 0) }, nil)
        tool = Structure::Tools::ColumnTool.new(
          runtime: rt, section_mm: [200, 200], base_level_id: '1FL', top_level_id: '1FL'
        )

        # Input in meters: 0.2, 0.2 -> 200x200 mm
        tool.onUserText('0.2, 0.2', nil)
        assert_equal [200.0, 200.0], tool.instance_variable_get(:@section_mm)

        # Input in meters rectangular: 0.3, 0.5 -> 300x500 mm
        tool.onUserText('0.3, 0.5', nil)
        assert_equal [300.0, 500.0], tool.instance_variable_get(:@section_mm)

        # Input in mm: 400, 400 -> 400x400 mm
        tool.onUserText('400, 400', nil)
        assert_equal [400.0, 400.0], tool.instance_variable_get(:@section_mm)
      end
    end
  end
end
