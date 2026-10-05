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

require_relative '../../apps/sketchup-extension/constructflow/core/shortcut_manager'
require_relative '../../apps/sketchup-extension/constructflow/core/html_dialog'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/tools/wall_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/tools/column_tool'

module JiraNot
  module ConstructFlow
    class ShortcutManagerTest < Minitest::Test
      LevelStub = Struct.new(:id, :name, :elevation_mm, :kind, keyword_init: true)

      class ModelStub
        attr_accessor :active_tool
        def select_tool(tool)
          @active_tool = tool
        end
      end

      def make_runtime
        l1 = LevelStub.new(id: 'lvl-1', name: '1FL', elevation_mm: 0, kind: 'floor')
        levels_map = { 'lvl-1' => l1 }
        model = ModelStub.new

        Struct.new(:project, :levels, :smart_objects, :connectors, :modules, :diagnostics, :active_model, :commands, keyword_init: true).new(
          project: Struct.new(:project_id, :working_phase).new('test-p', 'new_construction'),
          levels: levels_map,
          smart_objects: [],
          connectors: Struct.new(:connector_count).new(0),
          modules: [],
          diagnostics: Struct.new(:recent).new([]),
          active_model: model,
          commands: nil
        )
      end

      def setup
        Core::ShortcutManager.reset_buffer
      end

      def test_shortcuts_registry_completeness
        shortcuts = Core::ShortcutManager::SHORTCUTS
        expected_codes = %w[
          WA CL BM DR WN OP FL CE FD GR RF FRM MFR HGR AR GT
          CN PI MH PB CB WR SF AS CT CF IN LV PH
          GF RB BBS ST CW MCW RM PV NP PF PS DIM EL SCN SS SA LS AF CSV
        ]
        expected_codes.each do |code|
          assert shortcuts.key?(code), "Shortcut '#{code}' should be registered in SHORTCUTS"
        end
      end

      def test_roof_family_codes_are_distinct_typable_and_registered
        codes = %w[RF FRM MFR HGR AR]
        shortcuts = Core::ShortcutManager::SHORTCUTS

        codes.each { |code| assert shortcuts.key?(code), "Roof code #{code} must be registered" }

        actions = codes.map { |code| shortcuts[code][:action] }
        assert_equal actions.uniq, actions, 'Each roof code must map to a distinct action'

        # An exact match wins while typing, so a shared prefix makes the longer
        # code unreachable. Roof framing must never be shadowed by RF.
        codes.combination(2).each do |a, b|
          refute a.start_with?(b) || b.start_with?(a),
                 "Roof codes #{a}/#{b} share a prefix, so one cannot be typed"
        end

        assert_equal :roof, shortcuts['RF'][:action]
        assert_equal :roof_framing, shortcuts['FRM'][:action]
      end

      def test_panel_payload_stringifies_symbol_keys
        assert_equal({ 'form' => 'hip', 'slope_deg' => 30.0 },
                     Core::ShortcutManager.panel_payload({ form: 'hip', slope_deg: 30.0 }))
      end

      def test_key_to_char_conversion
        assert_equal 'W', Core::ShortcutManager.key_to_char(87)
        assert_equal 'A', Core::ShortcutManager.key_to_char(65)
        assert_equal 'C', Core::ShortcutManager.key_to_char(99) # lowercase 'c'
        assert_equal 'L', Core::ShortcutManager.key_to_char(108) # lowercase 'l'
        assert_nil Core::ShortcutManager.key_to_char(16) # Shift
        assert_nil Core::ShortcutManager.key_to_char(8) # Backspace
      end

      def test_typing_wa_activates_wall_tool
        rt = make_runtime
        # Press 'W' (87)
        result1 = Core::ShortcutManager.handle_key(87, rt)
        assert result1, "Prefix 'W' should be accepted"
        assert_equal 'W', Core::ShortcutManager.buffer

        # Press 'A' (65)
        result2 = Core::ShortcutManager.handle_key(65, rt)
        assert result2, "Shortcut 'WA' should execute"
        assert_equal '', Core::ShortcutManager.buffer
        assert_instance_of Architecture::Tools::WallTool, rt.active_model.active_tool
      end

      def test_typing_cl_activates_column_tool
        rt = make_runtime
        # Press 'C' (67)
        Core::ShortcutManager.handle_key(67, rt)
        assert_equal 'C', Core::ShortcutManager.buffer

        # Press 'L' (76)
        Core::ShortcutManager.handle_key(76, rt)
        assert_equal '', Core::ShortcutManager.buffer
        assert_instance_of Structure::Tools::ColumnTool, rt.active_model.active_tool
      end

      def test_typing_bm_activates_beam_tool
        rt = make_runtime
        Core::ShortcutManager.handle_key(66, rt) # 'B'
        Core::ShortcutManager.handle_key(77, rt) # 'M'
        assert_instance_of Structure::Tools::BeamTool, rt.active_model.active_tool
      end

      def test_typing_dr_activates_door_tool
        rt = make_runtime
        Core::ShortcutManager.handle_key(68, rt) # 'D'
        Core::ShortcutManager.handle_key(82, rt) # 'R'
        assert_instance_of DoorWindow::Tools::DoorWindowTool, rt.active_model.active_tool
        assert_equal 'door', rt.active_model.active_tool.instance_variable_get(:@category)
      end

      def test_typing_wn_activates_window_tool
        rt = make_runtime
        Core::ShortcutManager.handle_key(87, rt) # 'W'
        Core::ShortcutManager.handle_key(78, rt) # 'N'
        assert_instance_of DoorWindow::Tools::DoorWindowTool, rt.active_model.active_tool
        assert_equal 'window', rt.active_model.active_tool.instance_variable_get(:@category)
      end

      def test_direct_execute_shortcut
        rt = make_runtime
        assert Core::ShortcutManager.execute('GR', rt)
        assert_instance_of Structure::Tools::GridTool, rt.active_model.active_tool

        assert Core::ShortcutManager.execute('CN', rt)
        assert_instance_of Electrical::Tools::ConduitTool, rt.active_model.active_tool

        assert Core::ShortcutManager.execute('FD', rt)
        assert_instance_of Structure::Tools::FoundationTool, rt.active_model.active_tool
      end

      def test_buffer_timeout_resets_previous_key
        rt = make_runtime
        # Press 'W'
        Core::ShortcutManager.handle_key(87, rt)
        assert_equal 'W', Core::ShortcutManager.buffer

        # Simulate 1.5 seconds later
        Core::ShortcutManager.last_time = Time.now.to_f - 1.5

        # Press 'C' -> should not combine into 'WC', should reset to 'C'
        Core::ShortcutManager.handle_key(67, rt)
        assert_equal 'C', Core::ShortcutManager.buffer
      end

      def test_tool_switching_from_inside_wall_tool
        rt = make_runtime
        wall_tool = Architecture::Tools::WallTool.new(runtime: rt, thickness_mm: 100, height_mm: 2800)
        rt.active_model.select_tool(wall_tool)

        # Inside WallTool, user types 'C' (67) then 'L' (76)
        wall_tool.onKeyDown(67, false, 0, nil)
        assert_equal 'C', Core::ShortcutManager.buffer

        wall_tool.onKeyDown(76, false, 0, nil)
        assert_equal '', Core::ShortcutManager.buffer
        # Active tool in model is now ColumnTool!
        assert_instance_of Structure::Tools::ColumnTool, rt.active_model.active_tool
      end

      def test_prompt_true_opens_properties_dialog_and_uses_entered_values
        rt = make_runtime

        with_ui_inputbox(['250', '3200', '']) do
          assert Core::ShortcutManager.execute('WA', rt, prompt: true)
        end

        tool = rt.active_model.active_tool
        assert_instance_of Architecture::Tools::WallTool, tool
        assert_equal 250.0, tool.instance_variable_get(:@thickness_mm)
        assert_equal 3200.0, tool.instance_variable_get(:@height_mm)
      end

      def test_prompt_cancel_aborts_before_the_tool_draws
        rt = make_runtime

        with_ui_inputbox(nil) do
          refute Core::ShortcutManager.execute('WA', rt, prompt: true)
        end

        assert_nil rt.active_model.active_tool
      end

      def test_prompt_false_skips_the_dialog_for_keyboard_shortcuts
        rt = make_runtime

        with_ui_inputbox(['999', '999', '']) do
          assert Core::ShortcutManager.execute('WA', rt, prompt: false)
        end

        tool = rt.active_model.active_tool
        assert_equal 100.0, tool.instance_variable_get(:@thickness_mm)
      end

      private

      def with_ui_inputbox(result)
        added_ui = !Object.const_defined?(:UI)
        Object.const_set(:UI, Module.new) if added_ui
        ui = Object.const_get(:UI)
        had_method = ui.respond_to?(:inputbox)
        original = ui.method(:inputbox) if had_method

        ui.define_singleton_method(:inputbox) { |*_args| result }
        yield
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
