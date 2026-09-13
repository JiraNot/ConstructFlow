# frozen_string_literal: true

require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/modules/extension/extension_presets_catalog'
require_relative '../../apps/sketchup-extension/constructflow/modules/extension/extension_presets_builder'

class ExtensionPresetsTest < Minitest::Test
  Catalog = JiraNot::ConstructFlow::Extension::ExtensionPresetsCatalog
  Builder = JiraNot::ConstructFlow::Extension::ExtensionPresetsBuilder

  def test_catalog_has_four_core_thai_presets
    presets = Catalog.all
    assert_equal 4, presets.length

    ids = Catalog.ids
    assert_includes ids, 'carport_standard'
    assert_includes ids, 'thai_kitchen'
    assert_includes ids, 'garden_terrace'
    assert_includes ids, 'multipurpose_suite'
  end

  def test_preset_dimensions_and_specifications
    carport = Catalog.find('carport_standard')
    assert carport
    assert_equal 5.0, carport[:dimensions][:width_m]
    assert_equal 5.5, carport[:dimensions][:depth_m]
    assert_equal 'parking', carport[:category]
    assert carport[:cost_estimate][:total_with_factor_thb] > 100000

    kitchen = Catalog.find('thai_kitchen')
    assert kitchen
    assert_equal 5.0, kitchen[:dimensions][:width_m]
    assert_equal 2.5, kitchen[:dimensions][:depth_m]
    assert_equal 'kitchen', kitchen[:category]
    assert_includes kitchen[:title_th], 'ครัวไทย'

    terrace = Catalog.find('garden_terrace')
    assert terrace
    assert_equal 4.0, terrace[:dimensions][:width_m]
    assert_equal 3.0, terrace[:dimensions][:depth_m]
    assert_equal 'outdoor', terrace[:category]

    suite = Catalog.find('multipurpose_suite')
    assert suite
    assert_equal 4.0, suite[:dimensions][:width_m]
    assert_equal 6.0, suite[:dimensions][:depth_m]
    assert_equal 'room', suite[:category]
  end

  def test_builder_runs_in_model_context
    fake_model = FakeModel.new
    # Stub layers and materials if not present
    def fake_model.layers
      @layers_hash ||= Hash.new { |h, k| h[k] = FakeAttributeCarrier.new }
    end
    def fake_model.materials
      @mat_hash ||= Hash.new { |h, k| h[k] = FakeAttributeCarrier.new }
    end

    Catalog.ids.each do |preset_id|
      grp = Builder.build_preset(preset_id, [0, 0, 0], fake_model)
      assert grp, "Failed to build preset #{preset_id}"
      assert_equal "CF_Preset_#{preset_id}", grp.name
      assert_equal preset_id, grp.get_attribute('ConstructFlow', 'PresetId')
    end
  end
end
