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

  def test_toolbar_construction_order_and_separators
    # Mock UI environment
    mock_items = []
    mock_separators = 0

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

      # 19 tools must be present
      assert_equal 19, toolbar.items.size
      # 5 separators dividing the 6 workflow groups
      assert_equal 5, toolbar.separators

      # Verify exact workflow sequence
      assert_includes toolbar.items[0].tooltip, '1.0' # inspector
      assert_includes toolbar.items[1].tooltip, '1.1' # level
      assert_includes toolbar.items[2].tooltip, '1.2' # phase
      assert_includes toolbar.items[3].tooltip, '2.1' # foundation
      assert_includes toolbar.items[4].tooltip, '2.2' # column
      assert_includes toolbar.items[5].tooltip, '3.1' # wall
      assert_includes toolbar.items[6].tooltip, '3.2' # opening
      assert_includes toolbar.items[7].tooltip, '3.3' # door_window
      assert_includes toolbar.items[8].tooltip, '3.4' # roof
      assert_includes toolbar.items[9].tooltip, '3.5' # gutter
      assert_includes toolbar.items[10].tooltip, '4.1' # manhole
      assert_includes toolbar.items[11].tooltip, '4.2' # pipe
      assert_includes toolbar.items[12].tooltip, '4.3' # panelboard
      assert_includes toolbar.items[13].tooltip, '4.4' # cable
      assert_includes toolbar.items[14].tooltip, '5.1' # surface
      assert_includes toolbar.items[15].tooltip, '5.2' # cabinet
      assert_includes toolbar.items[16].tooltip, '5.3' # wardrobe
      assert_includes toolbar.items[17].tooltip, '6.1' # asset
      assert_includes toolbar.items[18].tooltip, '6.2' # costing

      # Verify icons were assigned to every command
      toolbar.items.each do |item|
        refute_nil item.small_icon
        refute_nil item.large_icon
        assert File.exist?(item.small_icon)
        assert File.exist?(item.large_icon)
      end
    ensure
      Object.send(:remove_const, :UI) if Object.const_defined?(:UI)
      Object.const_set(:UI, original_ui) if original_ui
    end
  end
end
