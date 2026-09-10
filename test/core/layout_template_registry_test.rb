# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'layout_template_placeholder_map')
require File.join(CORE, 'layout_template_registry')

class LayoutTemplateRegistryTest < Minitest::Test
  def definition(version:, path:, families: ['plumbing_drainage_plan'], use_cases: ['construction'])
    JiraNot::ConstructFlow::Core::LayoutTemplateDefinition.new(
      key: 'company.a3',
      version: version,
      path: path,
      paper_size: 'A3',
      orientation: 'landscape',
      drawing_families: families,
      use_cases: use_cases,
      placeholder_tokens: { 'sheet_number' => '{{COMPANY:SHEET}}' },
      revision_prefix: 'COMPANY:REV',
      strategy: 'template_only'
    )
  end

  def test_resolves_latest_compatible_version
    registry = JiraNot::ConstructFlow::Core::LayoutTemplateRegistry.new
    registry.register(definition(version: '1.2.0', path: '/templates/company-a3-v1.layout'))
    registry.register(definition(version: '1.10.0', path: '/templates/company-a3-v2.layout'))

    result = registry.resolve!(
      paper_size: 'A3',
      orientation: 'landscape',
      drawing_family: 'plumbing_drainage_plan',
      use_case: 'construction'
    )

    assert_equal '1.10.0', result.version
    assert_equal '/templates/company-a3-v2.layout', result.path
    assert_equal '{{COMPANY:SHEET}}', result.placeholder_tokens['sheet_number']
    assert_equal 'COMPANY:REV', result.revision_prefix
    assert_equal 'template_only', result.strategy
  end

  def test_preferred_key_and_version_are_deterministic
    registry = JiraNot::ConstructFlow::Core::LayoutTemplateRegistry.new
    registry.register(definition(version: '1.0.0', path: '/templates/company-a3-v1.layout'))
    registry.register(definition(version: '2.0.0', path: '/templates/company-a3-v2.layout'))

    result = registry.resolve!(
      paper_size: 'A3', orientation: 'landscape', drawing_family: 'plumbing_drainage_plan',
      use_case: 'construction', preferred_key: 'company.a3', preferred_version: '1.0.0'
    )

    assert_equal '1.0.0', result.version
  end

  def test_supports_wildcard_family_for_shared_company_template
    registry = JiraNot::ConstructFlow::Core::LayoutTemplateRegistry.new
    registry.register(definition(version: '1.0.0', path: '/templates/company-all.layout', families: ['*']))

    result = registry.resolve!(
      paper_size: 'A3', orientation: 'landscape', drawing_family: 'roof_plan', use_case: 'construction'
    )

    assert_equal 'company.a3', result.key
  end

  def test_rejects_incompatible_preferred_template
    registry = JiraNot::ConstructFlow::Core::LayoutTemplateRegistry.new
    registry.register(definition(version: '1.0.0', path: '/templates/company-a3.layout'))

    assert_raises(ArgumentError) do
      registry.resolve!(
        paper_size: 'A1', orientation: 'landscape', drawing_family: 'plumbing_drainage_plan',
        use_case: 'construction', preferred_key: 'company.a3'
      )
    end
  end
end
