# frozen_string_literal: true

require_relative '../test_helper'

class ToolbarI18nTest < Minitest::Test
  Catalog = JiraNot::ConstructFlow::Core::ToolCatalog

  # Every catalog tool must ship its Thai i18n strings.
  def tool_names
    Catalog::TOOLS.map { |tool| tool[:i18n].sub(/\Atool\./, '') }
  end

  def test_i18n_has_all_catalog_tools_with_thai_strings
    tool_names.each do |tool|
      label = JiraNot::ConstructFlow::Core::I18n.t("tool.#{tool}.label")
      tooltip = JiraNot::ConstructFlow::Core::I18n.t("tool.#{tool}.tooltip")
      status = JiraNot::ConstructFlow::Core::I18n.t("tool.#{tool}.status")

      refute_nil label, "Missing label for #{tool}"
      refute_empty label, "Empty label for #{tool}"
      refute_nil tooltip, "Missing tooltip for #{tool}"
      assert_includes tooltip, '[ขั้นตอนที่', "Tooltip for #{tool} must contain step workflow guide"
      refute_nil status, "Missing status text for #{tool}"
      refute_empty status, "Empty status text for #{tool}"
    end
  end

  def test_every_stage_has_label_tooltip_and_status
    JiraNot::ConstructFlow::Core::ToolCatalog::STAGES.each do |stage|
      prefix = stage[:i18n]
      label = JiraNot::ConstructFlow::Core::I18n.t(prefix)
      tooltip = JiraNot::ConstructFlow::Core::I18n.t("#{prefix}.tooltip")
      status = JiraNot::ConstructFlow::Core::I18n.t("#{prefix}.status")

      refute_empty label, "Missing label for stage #{stage[:key]}"
      refute_equal prefix, label, "Stage #{stage[:key]} label must be a real string, not the i18n key"
      refute_equal "#{prefix}.tooltip", tooltip, "Stage #{stage[:key]} tooltip must be translated"
      refute_equal "#{prefix}.status", status, "Stage #{stage[:key]} status must be translated"
    end
  end

  def test_panel_launcher_has_i18n_strings
    prefix = 'tool.panel'
    refute_empty JiraNot::ConstructFlow::Core::I18n.t("#{prefix}.label")
    refute_empty JiraNot::ConstructFlow::Core::I18n.t("#{prefix}.tooltip")
    refute_empty JiraNot::ConstructFlow::Core::I18n.t("#{prefix}.status")
  end

  def test_all_toolbar_icons_exist_on_disk_both_1x_and_2x
    catalog = JiraNot::ConstructFlow::Core::ToolCatalog
    icon_dir = catalog::ICON_DIR
    assert Dir.exist?(icon_dir), "Icons directory #{icon_dir} must exist"

    # Every icon any surface can render, derived from the catalog itself.
    icons = (catalog::TOOLS.map { |tool| tool[:icon] } +
             catalog::STAGES.map { |stage| stage[:icon] } +
             [catalog::PANEL[:icon]]).uniq

    icons.each do |tool|
      small = File.join(icon_dir, "#{tool}.png")
      large = File.join(icon_dir, "#{tool}@2x.png")

      assert File.exist?(small), "Missing 24x24 icon: #{small}"
      assert File.exist?(large), "Missing 48x48 icon: #{large}"
      assert File.size(small) > 50, "Small icon #{tool} is too small / corrupt"
      assert File.size(large) > 50, "Large icon #{tool} is too small / corrupt"
    end
  end

  def test_toolbar_is_one_launcher_plus_one_flyout_per_stage
    fake_command_class = Class.new do
      attr_accessor :name, :tooltip, :status_bar_text, :small_icon, :large_icon
      attr_reader :block
      def initialize(name, &block)
        @name = name
        @block = block
      end
    end

    fake_toolbar_class = Class.new do
      attr_reader :name, :items, :separators
      def initialize(name)
        @name = name
        @items = []
        @separators = 0
      end
      def add_item(cmd)
        @items << cmd
      end
      def add_separator
        @separators += 1
      end
      def restore; end
    end

    stub_ui = Module.new
    stub_ui.const_set(:Command, fake_command_class)
    stub_ui.const_set(:Toolbar, fake_toolbar_class)

    original_ui = Object.const_get(:UI) if Object.const_defined?(:UI)
    begin
      Object.send(:remove_const, :UI) if Object.const_defined?(:UI)
      Object.const_set(:UI, stub_ui)

      catalog = JiraNot::ConstructFlow::Core::ToolCatalog
      toolbar_module = JiraNot::ConstructFlow::Core::Toolbar

      toolbar = toolbar_module.install_toolbar(build_test_runtime)

      # 1 full-editor launcher + 1 button per workflow stage.
      assert_equal 1 + catalog::STAGES.size, toolbar.items.size,
                   'Toolbar must collapse to one launcher plus one button per stage'
      assert_equal 1, toolbar.separators, 'The launcher must be separated from the stage flyouts'

      launcher = toolbar.items.first
      assert_equal JiraNot::ConstructFlow::Core::I18n.t('tool.panel.label'), launcher.name
      assert launcher.block.respond_to?(:call)

      # A resolved label must never be the raw i18n key (guards typo'd keys).
      toolbar.items.each do |cmd|
        refute_match(/\.(label|tooltip|status)\z/, cmd.name,
                     "Toolbar label '#{cmd.name}' is an unresolved i18n key")
        refute_match(/^group\./, cmd.name, "Toolbar label '#{cmd.name}' is an unresolved stage key")
      end

      toolbar.items.drop(1).each_with_index do |cmd, index|
        stage = catalog::STAGES[index]
        assert_equal JiraNot::ConstructFlow::Core::I18n.t(stage[:i18n]), cmd.name
        assert_equal JiraNot::ConstructFlow::Core::I18n.t("#{stage[:i18n]}.tooltip"), cmd.tooltip
        assert_equal JiraNot::ConstructFlow::Core::I18n.t("#{stage[:i18n]}.status"), cmd.status_bar_text
        assert_match(/\A\d+\./, cmd.name, "Stage #{stage[:key]} label should carry its workflow number")
        assert cmd.block.respond_to?(:call), "Stage #{stage[:key]} must open a flyout"

        refute_nil cmd.small_icon, "Stage #{stage[:key]} must have a small icon"
        refute_nil cmd.large_icon, "Stage #{stage[:key]} must have a large icon"
        assert File.exist?(cmd.small_icon), "Missing small icon for stage #{stage[:key]}"
        assert File.exist?(cmd.large_icon), "Missing large icon for stage #{stage[:key]}"
      end
    ensure
      Object.send(:remove_const, :UI) if Object.const_defined?(:UI)
      Object.const_set(:UI, original_ui) if original_ui
    end
  end

  def test_stage_flyouts_cover_every_tool_exactly_once
    catalog = JiraNot::ConstructFlow::Core::ToolCatalog
    shortcuts = JiraNot::ConstructFlow::Core::ShortcutManager::SHORTCUTS

    codes = catalog::STAGES.flat_map { |stage| catalog.tools_for(stage[:key]).map { |tool| tool[:code] } }

    assert_equal codes.uniq, codes, 'A tool must belong to exactly one stage flyout'
    assert_equal catalog::TOOLS.size, codes.size,
                 'Every catalog tool must remain reachable from a stage flyout'

    codes.each do |code|
      assert shortcuts.key?(code), "Stage flyout tool #{code} must be a registered ShortcutManager action"
    end
  end
end
