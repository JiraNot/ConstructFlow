# frozen_string_literal: true

require_relative '../test_helper'

class StagePaletteTest < Minitest::Test
  Palette = JiraNot::ConstructFlow::Core::StagePalette
  Catalog = JiraNot::ConstructFlow::Core::ToolCatalog
  Shortcuts = JiraNot::ConstructFlow::Core::ShortcutManager

  def test_build_html_lists_every_tool_of_the_stage
    html = Palette.build_html('architecture')

    assert_includes html, JiraNot::ConstructFlow::Core::I18n.t('group.architecture')
    Catalog.tools_for('architecture').each do |tool|
      assert_includes html,
                      JiraNot::ConstructFlow::Core::I18n.t("#{tool[:i18n]}.label"),
                      "Palette must list #{tool[:code]}"
      assert_includes html, "runTool('#{tool[:code]}')", "Palette must wire #{tool[:code]}"
    end

    # Tools from other stages must not leak into this palette.
    refute_includes html, "runTool('WA')" if Catalog.tools_for('architecture').none? { |t| t[:code] == 'WA' }
  end

  def test_every_stage_palette_embeds_icon_data_uris
    Catalog::STAGES.each do |stage|
      html = Palette.build_html(stage[:key])
      assert_includes html, 'data:image/png;base64,',
                      "Stage #{stage[:key]} palette must embed its tool icons"
      refute_includes html, 'ไม่พบกลุ่มเครื่องมือ'
    end
  end

  def test_build_html_for_unknown_stage_is_safe
    html = Palette.build_html('does-not-exist')
    assert_includes html, 'ไม่พบกลุ่มเครื่องมือ'
  end

  def test_icon_data_uri_handles_missing_icons
    uri = Palette.icon_data_uri('wall')
    assert uri.start_with?('data:image/png;base64,'), 'Known icon must produce a data URI'

    assert_equal '', Palette.icon_data_uri('definitely-not-an-icon')
  end

  def test_open_is_a_no_op_without_a_html_dialog
    skip 'UI::HtmlDialog is available in this environment' if defined?(UI::HtmlDialog)

    assert_nil Palette.open(build_test_runtime, 'setup')
  end

  def test_run_tool_dispatches_through_shortcut_manager_with_prompt
    runtime = build_test_runtime
    captured = nil
    original = Shortcuts.method(:execute)

    Shortcuts.define_singleton_method(:execute) do |code, rt, prompt: false|
      captured = [code, rt, prompt]
      true
    end
    begin
      Palette.run_tool(runtime, 'WA')
    ensure
      Shortcuts.define_singleton_method(:execute, original)
    end

    assert_equal ['WA', runtime, true], captured,
                 'Palette tool selection must run the tool with its properties dialog'
  end
end
