# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'drawing_view_preset_registry')
require File.join(CORE, 'drawing_view_preset_registration')

class DrawingViewPresetRegistryTest < Minitest::Test
  def setup
    @registry = JiraNot::ConstructFlow::Core::DrawingViewPresetRegistry.new
    JiraNot::ConstructFlow::Core::DrawingViewPresetRegistration.install(@registry)
  end

  def test_registers_three_plumbing_presets
    assert_equal 3, @registry.size
    assert_equal %w[plumbing.construction plumbing.coordination plumbing.simple], @registry.all.map(&:id)
  end

  def test_construction_preset_carries_scale_phase_and_lod
    preset = @registry.fetch!('plumbing.construction')
    assert_equal '1:50', preset.scale
    assert_equal 'proposed', preset.phase_view
    assert_equal 'construction', preset.lod
    assert_equal 'plumbing_drainage_plan', preset.drawing_family
    assert_equal 'plumbing.construction', preset.context['style_preset']
  end

  def test_unknown_preset_fails_explicitly
    assert_raises(KeyError) { @registry.fetch!('missing') }
  end
end
