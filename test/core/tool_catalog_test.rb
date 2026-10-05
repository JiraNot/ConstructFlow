# frozen_string_literal: true

require_relative '../test_helper'

class ToolCatalogTest < Minitest::Test
  Catalog = JiraNot::ConstructFlow::Core::ToolCatalog

  def test_stages_are_unique_and_complete
    keys = Catalog::STAGES.map { |stage| stage[:key] }
    assert_equal keys.uniq, keys, 'Stage keys must be unique'
    assert_equal 7, keys.size

    Catalog::STAGES.each do |stage|
      refute_empty stage[:icon], "Stage #{stage[:key]} needs an icon"
      refute_empty stage[:i18n], "Stage #{stage[:key]} needs an i18n prefix"
      refute_empty Catalog.tools_for(stage[:key]), "Stage #{stage[:key]} must expose at least one tool"
    end
  end

  def test_tools_are_unique_and_belong_to_a_declared_stage
    codes = Catalog::TOOLS.map { |tool| tool[:code] }
    assert_equal codes.uniq, codes, 'Tool codes must be unique'

    stage_keys = Catalog::STAGES.map { |stage| stage[:key] }
    Catalog::TOOLS.each do |tool|
      assert_includes stage_keys, tool[:stage], "Tool #{tool[:code]} points at an unknown stage"
      refute_empty tool[:icon], "Tool #{tool[:code]} needs an icon"
      refute_empty tool[:i18n], "Tool #{tool[:code]} needs an i18n prefix"
    end
  end

  def test_every_tool_code_is_a_registered_shortcut
    shortcuts = JiraNot::ConstructFlow::Core::ShortcutManager::SHORTCUTS

    Catalog::TOOLS.each do |tool|
      assert shortcuts.key?(tool[:code]),
             "Tool #{tool[:code]} must map to a ShortcutManager action"

      # A resolved string must not still be the i18n key (guards typo'd keys).
      label = JiraNot::ConstructFlow::Core::I18n.t("#{tool[:i18n]}.label")
      tooltip = JiraNot::ConstructFlow::Core::I18n.t("#{tool[:i18n]}.tooltip")
      status = JiraNot::ConstructFlow::Core::I18n.t("#{tool[:i18n]}.status")

      refute_equal "#{tool[:i18n]}.label", label, "Tool #{tool[:code]} label is an unresolved key"
      refute_equal "#{tool[:i18n]}.tooltip", tooltip, "Tool #{tool[:code]} tooltip is an unresolved key"
      refute_equal "#{tool[:i18n]}.status", status, "Tool #{tool[:code]} status is an unresolved key"
      assert_includes tooltip, '[ขั้นตอนที่', "Tool #{tool[:code]} tooltip needs its workflow step number"
    end
  end

  def test_tools_for_returns_only_that_stage_in_catalog_order
    architecture = Catalog.tools_for('architecture').map { |tool| tool[:code] }
    assert_equal %w[WA OP DR FL CE ST CW MCW RF GT FRM MFR HGR AR RM PV NP PF PS], architecture

    # The roof family must live together so the flyout shows it as one group.
    assert_equal %w[RF FRM MFR HGR AR], architecture & %w[RF FRM MFR HGR AR]

    structure = Catalog.tools_for('structure').map { |tool| tool[:code] }
    assert_equal %w[FD CL GF BM GR RB BBS], structure

    drawing = Catalog.tools_for('drawing').map { |tool| tool[:code] }
    assert_equal %w[DIM EL SCN SS SA LS AF], drawing

    # Every tool must be reachable from exactly one stage flyout.
    reachable = Catalog::STAGES.flat_map { |stage| Catalog.tools_for(stage[:key]).map { |t| t[:code] } }
    assert_equal Catalog::TOOLS.size, reachable.size
    assert_equal reachable.uniq, reachable

    refute_includes Catalog.tools_for('mep').map { |tool| tool[:code] }, 'WA'
  end

  def test_no_tool_code_shadows_another_tool_code
    codes = Catalog::TOOLS.map { |tool| tool[:code] }

    # An exact match wins while typing, so a code sharing a prefix with a
    # longer code makes the longer one unreachable.
    codes.combination(2).each do |a, b|
      refute a.start_with?(b) || b.start_with?(a),
             "Tool codes #{a}/#{b} share a prefix, so one cannot be typed"
    end
  end

  def test_tool_and_stage_lookup
    assert_equal 'wall', Catalog.tool('wa')[:icon]
    assert_nil Catalog.tool('NOPE')
    assert_equal 'interior', Catalog.stage(:interior)[:key]
    assert_nil Catalog.stage('nope')
  end

  def test_icon_path_resolves_existing_files
    small = Catalog.icon_path('wall')
    large = Catalog.icon_path('wall', large: true)

    assert small.end_with?('wall.png')
    assert large.end_with?('wall@2x.png')
    assert File.exist?(small)
    assert File.exist?(large)
  end
end
