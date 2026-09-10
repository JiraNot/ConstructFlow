# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'layout_template_placeholder_map')
require File.join(CORE, 'layout_template_registry')
require File.join(CORE, 'layout_template_pin_store')
require File.join(CORE, 'layout_template_asset_verifier')

class LayoutTemplatePinningTest < Minitest::Test
  def test_pins_exact_template_version_per_scope_and_use_case
    store = JiraNot::ConstructFlow::Core::LayoutTemplatePinStore.new
    pin = store.pin(scope_id: 'project-001', use_case: 'construction', template_key: 'company.a3', version: '2.1.0')

    assert_equal 'company.a3', pin.template_key
    assert_equal '2.1.0', store.fetch!(scope_id: 'project-001', use_case: 'construction').version
    assert_nil store.fetch(scope_id: 'project-001', use_case: 'permit')
  end

  def test_rejects_invalid_pin_hash
    store = JiraNot::ConstructFlow::Core::LayoutTemplatePinStore.new
    assert_raises(ArgumentError) do
      store.pin(scope_id: 'project-001', use_case: 'construction', template_key: 'company.a3', version: '1.0.0', sha256: 'bad')
    end
  end

  def test_verifier_checks_expected_hash
    definition = JiraNot::ConstructFlow::Core::LayoutTemplateDefinition.new(
      key: 'company.a3', version: '1.0.0', path: '/templates/company.layout',
      paper_size: 'A3', orientation: 'landscape'
    )
    actual = 'a' * 64
    verifier = JiraNot::ConstructFlow::Core::LayoutTemplateAssetVerifier.new(
      exists: ->(_path) { true }, digest: ->(_path) { actual }
    )

    result = verifier.verify!(definition, expected_sha256: actual)
    assert_equal true, result['verified']
    assert_equal actual, result['sha256']

    assert_raises(IOError) do
      verifier.verify!(definition, expected_sha256: 'b' * 64)
    end
  end

  def test_verifier_rejects_missing_asset
    definition = JiraNot::ConstructFlow::Core::LayoutTemplateDefinition.new(
      key: 'company.a3', version: '1.0.0', path: '/missing/company.layout',
      paper_size: 'A3', orientation: 'landscape'
    )
    verifier = JiraNot::ConstructFlow::Core::LayoutTemplateAssetVerifier.new(exists: ->(_path) { false })
    assert_raises(IOError) { verifier.verify!(definition) }
  end
end
