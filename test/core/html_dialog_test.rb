# frozen_string_literal: true

require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/core/html_dialog'

module JiraNot
  module ConstructFlow
    module Core
      class HtmlDialogManagerTest < Minitest::Test
        # Lightweight runtime stub
        RuntimeStub = Struct.new(:project, :levels, :smart_objects, :connectors,
                                 :modules, :diagnostics, :active_model, :commands,
                                 keyword_init: true) do
          def show_inspector; end
        end

        ProjectStub   = Struct.new(:project_id, :working_phase, keyword_init: true) do
          def working_phase=(v); self[:working_phase] = v; end
        end

        DiagStub = Struct.new(:log) do
          def recent(_n = 5); []; end
        end

        def runtime
          @runtime ||= RuntimeStub.new(
            project:       ProjectStub.new(project_id: 'proj-test-001', working_phase: 'new_construction'),
            levels:        [],
            smart_objects: [],
            connectors:    Struct.new(:connector_count).new(0),
            modules:       [],
            diagnostics:   DiagStub.new([]),
            active_model:  nil,
            commands:      nil
          )
        end

        # ── build_state ──────────────────────────────────────────
        def test_build_state_returns_hash
          state = HtmlDialogManager.send(:build_state, runtime)
          assert_instance_of Hash, state
          assert_equal 'proj-test-001', state[:project_id]
          assert_equal 'new_construction', state[:phase]
          assert_equal 0, state[:levels]
          assert_equal 0, state[:smart_objects]
        end

        # ── ACTIONS table completeness ───────────────────────────
        EXPECTED_ACTIONS = %w[
          add_gutter apply_surface array_on_face assign_rebar
          auto_dimension create_extension_preset create_level create_roof
          delete_selected detect_rooms dispatch_ai_command export_boq_csv
          export_thai_boq_excel fetch_takeoff_hud flip_selected_wall generate_a3_drawing_sheets
          generate_extension_scenes generate_hip_gable_roof generate_paving get_boq_data
          get_state place_panelboard revit_auto_roof save_catalog_asset
          save_custom_profile set_phase show_bbs show_costing
          show_inspector sweep_on_selection toggle_lod update_property
          update_selected_wall zoom_selected
        ].freeze

        def test_all_expected_actions_registered
          
          EXPECTED_ACTIONS.each do |action|
            assert HtmlDialogManager::ACTIONS.key?(action),
                   "Action '#{action}' not found in ACTIONS table"
          end
        end

        def test_actions_are_callables
          HtmlDialogManager::ACTIONS.each do |name, handler|
            assert handler.respond_to?(:call), "ACTIONS['#{name}'] must be callable"
          end
        end

        # ── set_phase validation ─────────────────────────────────
        def test_set_phase_valid
          handler = HtmlDialogManager::ACTIONS['set_phase']
          rt = RuntimeStub.new(
            project: ProjectStub.new(project_id: 'p', working_phase: 'new_construction'),
            levels: [], smart_objects: [], connectors: nil, modules: [], diagnostics: DiagStub.new([]),
            active_model: nil, commands: nil
          )
          # Should not raise
          handler.call(rt, { 'phase' => 'existing' })
          assert_equal 'existing', rt.project.working_phase
        end

        def test_set_phase_invalid_raises
          handler = HtmlDialogManager::ACTIONS['set_phase']
          assert_raises(RuntimeError) do
            handler.call(runtime, { 'phase' => 'bad_value' })
          end
        end

        # ── create_level validation ──────────────────────────────
        def test_create_level_blank_name_raises
          handler = HtmlDialogManager::ACTIONS['create_level']
          levels_spy = []
          rt = RuntimeStub.new(
            project:       ProjectStub.new(project_id: 'p', working_phase: 'new_construction'),
            levels:        levels_spy,
            smart_objects: [], connectors: nil, modules: [], diagnostics: DiagStub.new([]),
            active_model:  nil, commands: nil
          )
          assert_raises(RuntimeError) { handler.call(rt, { 'name' => '  ', 'elevation_mm' => 0 }) }
        end

        # ── UI_DIR points to existing ui/ folder ──────────────────
        def test_ui_dir_exists
          assert Dir.exist?(HtmlDialogManager::UI_DIR),
                 "ui/ directory not found at #{HtmlDialogManager::UI_DIR}"
        end

        def test_panel_html_exists
          html = File.join(HtmlDialogManager::UI_DIR, 'panel.html')
          assert File.exist?(html), "panel.html not found at #{html}"
        end

        # ── Panel shortcut badges must not contradict ShortcutManager ──
        # The panel badges are static labels now that the keyboard tool
        # shortcut layer (Core::ShortcutManager) is retired with the drawing
        # UI, so the expected codes live here instead of in a Ruby registry.
        PANEL_ROOF_BADGES = {
          'drawRoofFraming' => 'FRM',
          'modifyRoofFraming' => 'MFR',
          'generateHipGableRoof' => 'HGR',
          'drawRevitAutoRoof' => 'AR'
        }.freeze

        def test_panel_roof_badges_use_canonical_codes
          html = File.read(File.join(HtmlDialogManager::UI_DIR, 'panel.html'))

          # data-action -> badge, for every ribbon button that declares one.
          badges = {}
          html.scan(/<button\b([^>]*)>(.*?)<\/button>/m) do |attrs, inner|
            action = attrs[/data-action\s*=\s*"([^"]*)"/, 1]
            badge = inner[/ribbon-badge">\s*([^<]*?)\s*</, 1]
            next if action.nil? || badge.nil?

            badges[action] = badge.strip
          end

          PANEL_ROOF_BADGES.each do |action, code|
            assert_equal code, badges[action],
                         "Ribbon action #{action} must be badged [#{code}]"
          end

          # The historic conflict: roof framing badged as the roof-system code.
          refute_equal 'RF', badges['drawRoofFraming'],
                       'Roof framing must never be badged as RF (roof system)'
        end

        def test_panel_css_exists
          css = File.join(HtmlDialogManager::UI_DIR, 'panel.css')
          assert File.exist?(css), "panel.css not found at #{css}"
        end

        def test_panel_js_exists
          js = File.join(HtmlDialogManager::UI_DIR, 'panel.js')
          assert File.exist?(js), "panel.js not found at #{js}"
        end
      end
    end
  end
end
