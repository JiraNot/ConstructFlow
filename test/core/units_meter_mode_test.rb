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
        assert_equal :meter, Core::Units.active_unit
        assert_equal 3500.0, Core::Units.m_to_mm(3.5)
        assert_equal 2.8, Core::Units.mm_to_m(2800.0)
        assert_equal '3.50 m', Core::Units.format_length(3500.0, unit: :meter)
        assert_equal '2.80 m', Core::Units.format_length(2800.0, unit: :mm)
        assert_equal '0.200 m', Core::Units.format_dimension(200.0)
        assert_raises(ArgumentError) { Core::Units.m_input_to_mm('200 mm') }
        assert_raises(ArgumentError) { Core::Units.active_unit = :mm }
      end

      def test_model_units_are_configured_to_decimal_meters
        previous_length = Object.const_defined?(:Length) ? Object.const_get(:Length) : nil
        Object.send(:remove_const, :Length) if Object.const_defined?(:Length)
        Object.const_set(:Length, Module.new)
        Length.const_set(:Decimal, 0)
        Length.const_set(:Meter, 4)
        Length.const_set(:SquareMeter, 4)
        Length.const_set(:CubicMeter, 4)

        options = {}
        model = Struct.new(:options).new({ 'UnitsOptions' => options })
        assert Core::Units.configure_model(model)
        assert_equal 0, options['LengthFormat']
        assert_equal 4, options['LengthUnit']
        assert_equal 4, options['AreaUnit']
        assert_equal 4, options['VolumeUnit']
        assert_equal 3, options['LengthPrecision']
      ensure
        Object.send(:remove_const, :Length) if Object.const_defined?(:Length)
        Object.const_set(:Length, previous_length) if previous_length
      end

      def test_meter_inputbox_shows_meter_labels_and_converts_values
        with_ui_inputbox(['1.25', '3.1', 'free text', '0.075']) do |calls|
          actual = Core::Units.meter_inputbox(
            ['ความกว้างฐาน (mm)', 'Height (mm)', 'Label', 'Offset (mm)'],
            [1000.0, 2800.0, '3', 50.0],
            'Dialog'
          )
          prompts, defaults = calls.fetch(0)
          assert_equal ['ความกว้างฐาน (m)', 'Height (m)', 'Label', 'Offset (m)'], prompts
          assert_equal ['1.0', '2.8', '3', '0.05'], defaults
          assert_equal [1250.0, 3100.0, 'free text', 75.0], actual
        end
      end

      def test_meter_inputbox_rejects_millimeter_entry
        with_ui_inputbox(['2800 mm']) do
          assert_raises(ArgumentError) do
            Core::Units.meter_inputbox(['Height (mm)'], [2800.0], 'Dialog')
          end
        end
      end

      def test_numeric_distance_requires_meters
        assert_equal 3500.0, @engine.numeric_distance_mm('3.5')
        assert_equal 1200.0, @engine.numeric_distance_mm('1.2m')
        assert_raises(ArgumentError) { @engine.numeric_distance_mm('3500mm') }
        assert_raises(ArgumentError) { @engine.numeric_distance_mm('10,000') }
        assert_raises(ArgumentError) { @engine.numeric_distance_mm('3 ft') }
      end

      def test_column_tool_accepts_meter_inputs_and_displays_meters
        rt = Struct.new(:levels, :active_model).new({ '1FL' => Struct.new(:id, :elevation_mm).new('1FL', 0) }, nil)
        tool = Structure::Tools::ColumnTool.new(
          runtime: rt, section_mm: [200, 200], base_level_id: '1FL', top_level_id: '1FL'
        )

        tool.onUserText('0.2, 0.2', nil)
        assert_equal [200.0, 200.0], tool.instance_variable_get(:@section_mm)
        assert_match(/0.200 m × 0.200 m/, Sketchup.status_text)
        tool.onUserText('0.4', nil)
        assert_equal [400.0, 400.0], tool.instance_variable_get(:@section_mm)
        tool.onUserText('0.4, 0.4', nil)
        assert_equal [400.0, 400.0], tool.instance_variable_get(:@section_mm)
        assert_equal 21_000.0, Core::Units.m_input_to_mm('21')
        assert_raises(ArgumentError) { Core::Units.m_input_to_mm('21', max_meters: 20) }
      end

      private

      def with_ui_inputbox(result)
        added_ui = !Object.const_defined?(:UI)
        Object.const_set(:UI, Module.new) if added_ui
        ui = Object.const_get(:UI)
        had_method = ui.respond_to?(:inputbox)
        original = ui.method(:inputbox) if had_method
        calls = []
        ui.define_singleton_method(:inputbox) do |*args|
          calls << args
          result
        end
        yield calls
      ensure
        if had_method
          ui.define_singleton_method(:inputbox, original)
        elsif ui.singleton_class.method_defined?(:inputbox)
          ui.singleton_class.send(:remove_method, :inputbox)
        end
        Object.send(:remove_const, :UI) if added_ui
      end
    end
  end
end
