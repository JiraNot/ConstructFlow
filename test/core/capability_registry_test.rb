# frozen_string_literal: true

require_relative '../test_helper'

class CapabilityRegistryTest < Minitest::Test
  def test_register_fetch_and_unregister_owner
    registry = JiraNot::ConstructFlow::Core::CapabilityRegistry.new
    provider = Object.new

    registry.register('wall.host_surface', owner_module: 'constructflow.architecture', provider: provider)

    assert registry.available?('wall.host_surface')
    assert_same provider, registry.fetch('wall.host_surface')
    assert_equal 'constructflow.architecture', registry.record('wall.host_surface').owner_module
    assert_equal ['wall.host_surface'], registry.ids
    assert_equal ['wall.host_surface'], registry.unregister_owner('constructflow.architecture')
    refute registry.available?('wall.host_surface')
  end

  def test_duplicate_capability_is_rejected
    registry = JiraNot::ConstructFlow::Core::CapabilityRegistry.new
    registry.register('wall.host_surface', owner_module: 'constructflow.architecture', provider: Object.new)

    assert_raises(ArgumentError) do
      registry.register('wall.host_surface', owner_module: 'constructflow.other', provider: Object.new)
    end
  end
end
