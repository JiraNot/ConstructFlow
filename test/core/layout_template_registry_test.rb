# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'layout_template_registry')

class LayoutTemplateRegistryTest < Minitest::Test
  def asset(version:, path:, families: ['plumbing_drainage_plan'])
    JiraNot::ConstructFlow::Core::LayoutTemplateAsset.new(
      key: 'company.a3',
      version: version,
      path: path,
      paper_size: 'A3',
      orientation: 'landscape',
      drawing_families: families,
      issue_kinds: %w[construction permit]
    )
  end

  def test_fetches_latest_version_and_specific_version
    registry = JiraNot::ConstructFlow::Core::LayoutTemplateRegistry.new
    registry.register(asset(version: '1.0.0', path: '/templates/company-a3-v1.layout'))
    registry.register(asset(version: '1.1.0', path: '/templates/company-a3-v1_1.layout'))

    assert_equal '1.1.0', registry.fetch!('company.a3').version
    assert_equal '/templates/company-a3-v1.layout', registry.fetch!('company.a3', version: '1.0.0').path
    assert_equal %w[1.0.0 1.1.0], registry.versions('company.a3')
  end

  def test_resolves_compatible_template_and_rejects_incompatible_sheet
    registry = JiraNot::ConstructFlow::Core::LayoutTemplateRegistry.new
    registry.register(asset(version: '2', path: '/templates/company.layout'))

    resolved = registry.resolve(
      key: 'company.a3', paper_size: 'A3', orientation: 'landscape',
      drawing_family: 'plumbing_drainage_plan', issue_kind: 'construction'
    )
    assert_equal 'company.a3@2', resolved.identity

    assert_raises(ArgumentError) do
      registry.resolve(
        key: 'company.a3', paper_size: 'A1', orientation: 'landscape',
        drawing_family: 'plumbing_drainage_plan', issue_kind: 'construction'
      )
    end
  end

  def test_duplicate_identity_is_rejected
    registry = JiraNot::ConstructFlow::Core::LayoutTemplateRegistry.new
    registry.register(asset(version: '1', path: '/templates/a.layout'))
    assert_raises(ArgumentError) { registry.register(asset(version: '1', path: '/templates/b.layout')) }
  end
end
