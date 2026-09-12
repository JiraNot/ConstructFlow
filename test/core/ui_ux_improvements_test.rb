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

require_relative '../../apps/sketchup-extension/constructflow/core/html_dialog'
require_relative '../../apps/sketchup-extension/constructflow/core/plan_level_context'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/plan_reference_collector'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/tools/wall_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/tools/column_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/door_window/tools/place_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/door_window/tools/door_window_tool'

module JiraNot
  module ConstructFlow
    class UiUxImprovementsTest < Minitest::Test
      LevelStub = Struct.new(:id, :name, :elevation_mm, :kind, keyword_init: true)

      def make_runtime
        l1 = LevelStub.new(id: 'lvl-1', name: '1FL', elevation_mm: 0, kind: 'floor')
        l2 = LevelStub.new(id: 'lvl-2', name: '2FL', elevation_mm: 3500, kind: 'floor')
        levels_map = { 'lvl-1' => l1, 'lvl-2' => l2 }
        caps = {
          'opening.infill_host' => Object.new,
          'wall.host_surface'   => Object.new
        }

        Struct.new(:project, :levels, :smart_objects, :connectors, :modules, :diagnostics, :active_model, :commands, :capabilities, keyword_init: true).new(
          project: Struct.new(:project_id, :working_phase).new('test-p', 'new_construction'),
          levels: levels_map,
          smart_objects: [],
          connectors: Struct.new(:connector_count).new(0),
          modules: [],
          diagnostics: Struct.new(:recent).new([]),
          active_model: nil,
          commands: nil,
          capabilities: caps
        )
      end

      # ─────────────────────────────────────────────────────────────
      # 1. HTML Dialog New Actions & Level Serialization
      # ─────────────────────────────────────────────────────────────
      def test_html_dialog_actions_registered
        assert Core::HtmlDialogManager::ACTIONS.key?('zoom_selected'), "zoom_selected must be registered"
        assert Core::HtmlDialogManager::ACTIONS.key?('flip_selected_wall'), "flip_selected_wall must be registered"
        assert Core::HtmlDialogManager::ACTIONS.key?('delete_selected'), "delete_selected must be registered"
      end

      def test_build_state_includes_levels_list
        rt = make_runtime
        state = Core::HtmlDialogManager.send(:build_state, rt)
        assert_equal 2, state[:levels]
        assert state.key?(:levels_list)
        assert_equal 2, state[:levels_list].size
        assert_equal '1FL', state[:levels_list][0][:name]
        assert_equal 3500.0, state[:levels_list][1][:elevation_mm]
      end

      # ─────────────────────────────────────────────────────────────
      # 2. WallTool UX: Backspace Undo & Auto-closing Loop
      # ─────────────────────────────────────────────────────────────
      def test_wall_tool_backspace_undo_and_auto_close
        rt = make_runtime
        tool = Architecture::Tools::WallTool.new(runtime: rt, thickness_mm: 100, height_mm: 2800)

        # Press backspace with empty history
        tool.onKeyDown(8, false, 0, nil)
        assert_equal 0, tool.instance_variable_get(:@history).size

        p0 = Geom::Point3d.new(0, 0, 0)
        p1 = Geom::Point3d.new(1000, 0, 0)
        p2 = Geom::Point3d.new(1000, 1000, 0)

        tool.instance_variable_set(:@first_point, p0)
        tool.instance_variable_set(:@start_point, p2)
        tool.instance_variable_set(:@history, [{ start: p0, finish: p1 }, { start: p1, finish: p2 }])

        # Press Backspace (key 8)
        tool.onKeyDown(8, false, 0, nil)
        # Should have popped second segment and restored start_point to p1
        assert_equal 1, tool.instance_variable_get(:@history).size
        assert_equal p1, tool.instance_variable_get(:@start_point)

        # Press Backspace again to clear first point and finish history
        tool.onKeyDown(8, false, 0, nil)
        assert_equal 0, tool.instance_variable_get(:@history).size
        assert_nil tool.instance_variable_get(:@start_point)
        assert_nil tool.instance_variable_get(:@first_point)
      end

      # ─────────────────────────────────────────────────────────────
      # 3. ColumnTool UX: 'R' key 90° rotation & VCB dimension typing
      # ─────────────────────────────────────────────────────────────
      def test_column_tool_rotation_and_vcb
        rt = make_runtime
        tool = Structure::Tools::ColumnTool.new(
          runtime: rt, section_mm: [300, 300], base_level_id: 'lvl-1', top_level_id: 'lvl-2'
        )
        assert_equal 0.0, tool.instance_variable_get(:@rotation_deg)

        # Press 'R' key (82)
        tool.onKeyDown(82, false, 0, nil)
        assert_equal 90.0, tool.instance_variable_get(:@rotation_deg)

        tool.onKeyDown(82, false, 0, nil)
        assert_equal 180.0, tool.instance_variable_get(:@rotation_deg)

        tool.onKeyDown(82, false, 0, nil)
        assert_equal 270.0, tool.instance_variable_get(:@rotation_deg)

        tool.onKeyDown(82, false, 0, nil)
        assert_equal 360.0, tool.instance_variable_get(:@rotation_deg)

        # VCB dimension input "500, 400"
        tool.onUserText("500, 400", nil)
        assert_equal [500.0, 400.0], tool.instance_variable_get(:@section_mm)

        # VCB square input "600"
        tool.onUserText("600", nil)
        assert_equal [600.0, 600.0], tool.instance_variable_get(:@section_mm)
      end

      # ─────────────────────────────────────────────────────────────
      # 4. Door/Window Tool UX: Spacebar (32) and 'F' (70) swing flip
      # ─────────────────────────────────────────────────────────────
      def test_door_window_place_tool_flip
        rt = make_runtime
        tool = DoorWindow::Tools::PlaceTool.new(
          runtime: rt, category: 'door', operation: 'swing', frame_material: 'wood', panel_style: 'flush'
        )
        assert_equal false, tool.instance_variable_get(:@flip_swing)

        # Press Spacebar (32)
        tool.onKeyDown(32, false, 0, nil)
        assert_equal true, tool.instance_variable_get(:@flip_swing)

        # Press 'F' key (70)
        tool.onKeyDown(70, false, 0, nil)
        assert_equal false, tool.instance_variable_get(:@flip_swing)
      end

      def test_door_window_tool_flip
        rt = make_runtime
        tool = DoorWindow::Tools::DoorWindowTool.new(
          runtime: rt, category: 'door', operation: 'swing', frame_material: 'wood', panel_style: 'flush'
        )
        assert_equal false, tool.instance_variable_get(:@flip_swing)

        # Press Spacebar (32)
        tool.onKeyDown(32, false, 0, nil)
        assert_equal true, tool.instance_variable_get(:@flip_swing)

        # Press 'f' key (102)
        tool.onKeyDown(102, false, 0, nil)
        assert_equal false, tool.instance_variable_get(:@flip_swing)
      end
    end
  end
end
