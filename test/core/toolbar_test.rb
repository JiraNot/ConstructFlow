# frozen_string_literal: true

require_relative '../test_helper'

class ToolbarI18nTest < Minitest::Test
  TOOL_NAMES = %w[
    inspector level phase
    foundation column
    wall opening door_window roof gutter
    manhole pipe panelboard cable
    surface cabinet wardrobe
    asset costing
  ].freeze

  def test_i18n_has_all_19_tools_with_thai_strings
    TOOL_NAMES.each do |tool|
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

  def test_all_19_icons_exist_on_disk_both_1x_and_2x
    icon_dir = JiraNot::ConstructFlow::Core::Toolbar::ICON_DIR
    assert Dir.exist?(icon_dir), "Icons directory #{icon_dir} must exist"

    TOOL_NAMES.each do |tool|
      small = File.join(icon_dir, "#{tool}.png")
      large = File.join(icon_dir, "#{tool}@2x.png")

      assert File.exist?(small), "Missing 24x24 icon: #{small}"
      assert File.exist?(large), "Missing 48x48 icon: #{large}"
      assert File.size(small) > 50, "Small icon #{tool} is too small / corrupt"
      assert File.size(large) > 50, "Large icon #{tool} is too small / corrupt"
    end
  end

  def test_toolbar_panel_launch_button
    fake_command_class = Class.new do
      attr_accessor :name, :tooltip, :status_bar_text, :small_icon, :large_icon
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

      fake_runtime = build_test_runtime
      toolbar = JiraNot::ConstructFlow::Core::Toolbar.install_toolbar(fake_runtime)

      # 1 launcher button for the modern floating panel
      assert_equal 1, toolbar.items.size
      launcher = toolbar.items.first
      assert_equal 'ConstructFlow', launcher.name
      assert_includes launcher.tooltip, 'แผงควบคุม ConstructFlow'
      assert_includes launcher.status_bar_text, 'ConstructFlow'

      refute_nil launcher.small_icon
      refute_nil launcher.large_icon
      assert File.exist?(launcher.small_icon)
      assert File.exist?(launcher.large_icon)
    ensure
      Object.send(:remove_const, :UI) if Object.const_defined?(:UI)
      Object.const_set(:UI, original_ui) if original_ui
    end
  end
end
