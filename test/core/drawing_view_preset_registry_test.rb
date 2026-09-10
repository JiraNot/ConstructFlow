# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'drawing_view_preset_registry')
require File.join(CORE, 'drawing_view_preset_registration')

class DrawingViewPresetRegistryTest < Minitest::Test
  def setup
    @registry = JiraNot::ConstructFlow::Core::DrawingViewPresetRegistry.new
    JiraNot::ConstructFlow::Core::DrawingViewPresetRegistration.install(@registry)
  end

  def test_registers_six_plan_families_with_three_profiles_each
    assert_equal 18, @registry.size
    %w[plumbing architecture structure roof surface interior].each do |family|
      %w[simple construction coordination].each do |profile|
        assert @registry.fetch("#{family}.#{profile}"), "missing #{family}.#{profile}"
      end
    end
  end

  def test_construction_preset_carries_scale_phase_and_lod
    preset = @registry.fetch!('plumbing.construction')
    assert_equal '1:50', preset.scale
    assert_equal 'proposed', preset.phase_view
    assert_equal 'construction', preset.lod
    assert_equal 'plumbing_drainage_plan', preset.drawing_family
    assert_equal 'plumbing.construction', preset.context['style_preset']
  end

  def test_preserves_legacy_plumbing_scene_and_tag_identity
    preset = @registry.fetch!('plumbing.construction')
    assert_equal 'CF-DRAWING-CONSTRUCTION', preset.tag_name
    assert_equal 'ConstructFlow - Plumbing Plan - Construction', preset.scene_name
  end

  def test_new_domain_presets_have_unique_managed_tags_and_correct_families
    expected = {
      'architecture.construction' => 'architecture_plan',
      'structure.construction' => 'structure_plan',
      'roof.construction' => 'roof_plan',
      'surface.construction' => 'surface_paving_plan',
      'interior.construction' => 'interior_joinery_plan'
    }
    tags = expected.map do |id, drawing_family|
      preset = @registry.fetch!(id)
      assert_equal drawing_family, preset.drawing_family
      assert_match(/\ACF-DRAWING-/, preset.tag_name)
      preset.tag_name
    end
    assert_equal tags.length, tags.uniq.length
    assert_includes tags, 'CF-DRAWING-ARCHITECTURE-CONSTRUCTION'
  end

  def test_install_is_idempotent
    JiraNot::ConstructFlow::Core::DrawingViewPresetRegistration.install(@registry)
    assert_equal 18, @registry.size
  end

  def test_unknown_preset_fails_explicitly
    assert_raises(KeyError) { @registry.fetch!('missing') }
  end
end
