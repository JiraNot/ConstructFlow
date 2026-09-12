# frozen_string_literal: true

require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/profile_sweep_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/profile_sweep_geometry'

class ProfileSweepTest < Minitest::Test
  DefClass = JiraNot::ConstructFlow::Architecture::ProfileSweepDefinition
  GeomClass = JiraNot::ConstructFlow::Architecture::ProfileSweepGeometry

  def test_definition_attributes_and_length
    pts = [
      [0.0, 0.0, 0.0],
      [1000.0, 0.0, 0.0],
      [1000.0, 2000.0, 0.0]
    ]
    defn = DefClass.new(
      path_mm: pts,
      profile_code: 'SKIRT-100x15',
      anchor: :bottom_left,
      material: 'wood'
    )
    assert defn.valid?
    assert_equal 'SKIRT-100x15', defn.profile_code
    assert_equal :bottom_left, defn.anchor
    assert_in_delta 3000.0, defn.total_length_mm, 1.0
    assert_in_delta 3.0, defn.total_length_m, 0.01
  end

  def test_geometry_build
    model = build_test_runtime.active_model
    pts = [
      [0.0, 0.0, 0.0],
      [1000.0, 0.0, 0.0]
    ]
    defn = DefClass.new(
      path_mm: pts,
      profile_code: 'CORNICE-75x75',
      anchor: :top_left,
      material: 'plaster'
    )
    grp = GeomClass.build(model, defn)
    refute_nil grp
    assert_equal 'architecture.profile_sweep', grp.get_attribute('ConstructFlow', 'type')
    assert_equal 'CORNICE-75x75', grp.get_attribute('ConstructFlow', 'profile_code')
    assert_equal 'top_left', grp.get_attribute('ConstructFlow', 'anchor')
    assert_in_delta 1.0, grp.get_attribute('ConstructFlow', 'length_m'), 0.01
  end
end
