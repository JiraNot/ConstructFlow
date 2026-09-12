# frozen_string_literal: true

require 'minitest/autorun'
require_relative '../test_helper'
require 'constructflow/core/structural_profile_catalog'

class StructuralProfileCatalogTest < Minitest::Test
  Catalog = JiraNot::ConstructFlow::Core::StructuralProfileCatalog

  def test_anchors_list
    assert_equal 9, Catalog::ANCHORS.size
    assert_includes Catalog::ANCHORS, :center
    assert_includes Catalog::ANCHORS, :top_center
    assert_includes Catalog::ANCHORS, :bottom_left
  end

  def test_anchor_offset_center
    offset = Catalog.anchor_offset(:center, 200, 400)
    assert_in_delta 0.0, offset[0]
    assert_in_delta 0.0, offset[1]
  end

  def test_anchor_offset_top_center
    # Top center: X is 0, Y is +half_d (+200)
    offset = Catalog.anchor_offset(:top_center, 200, 400)
    assert_in_delta 0.0, offset[0]
    assert_in_delta 200.0, offset[1]
  end

  def test_anchor_offset_top_left
    # Top left: X is -half_w (-100), Y is +half_d (+200)
    offset = Catalog.anchor_offset(:top_left, 200, 400)
    assert_in_delta(-100.0, offset[0])
    assert_in_delta 200.0, offset[1]
  end

  def test_anchor_offset_bottom_right
    offset = Catalog.anchor_offset(:bottom_right, 200, 400)
    assert_in_delta 100.0, offset[0]
    assert_in_delta(-200.0, offset[1])
  end

  def test_thai_rc_beams_exist
    b1 = Catalog.find_profile('RC-B-0.20x0.40')
    refute_nil b1
    assert_equal 200, b1[:width_mm]
    assert_equal 400, b1[:depth_mm]
    assert_equal :rc_beam, b1[:category]
  end

  def test_thai_rc_columns_exist
    c1 = Catalog.find_profile('RC-C-0.20x0.20')
    refute_nil c1
    assert_equal 200, c1[:width_mm]
    assert_equal 200, c1[:depth_mm]
    assert_equal :rc_column, c1[:category]
  end

  def test_tis_wide_flange_and_h_beam
    wf200 = Catalog.find_profile('WF-200x100')
    refute_nil wf200
    assert_equal 100, wf200[:width_mm]
    assert_equal 200, wf200[:depth_mm]
    assert_in_delta 21.3, wf200[:weight_kg_m]

    h200 = Catalog.find_profile('H-200x200')
    refute_nil h200
    assert_equal 200, h200[:width_mm]
    assert_equal 200, h200[:depth_mm]
    assert_in_delta 49.9, h200[:weight_kg_m]
  end

  def test_tis_steel_shs_and_rhs
    shs = Catalog.find_profile('SHS-100x100x3.2')
    refute_nil shs
    assert_equal 100, shs[:width_mm]
    assert_in_delta 9.40, shs[:weight_kg_m]

    rhs = Catalog.find_profile('RHS-100x50x3.2')
    refute_nil rhs
    assert_equal 50, rhs[:width_mm]
    assert_equal 100, rhs[:depth_mm]
  end

  def test_tis_lip_channel_c
    c = Catalog.find_profile('C-100x50x20x3.2')
    refute_nil c
    assert_equal 50, c[:width_mm]
    assert_equal 100, c[:depth_mm]
    assert_in_delta 5.06, c[:weight_kg_m]
  end

  def test_tis_steel_pipe_and_channel
    pipe = Catalog.find_profile('PIPE-4"')
    refute_nil pipe
    assert_equal 114.3, pipe[:width_mm]
    assert_in_delta 9.56, pipe[:weight_kg_m]

    ch = Catalog.find_profile('CH-100x50x5x7.5')
    refute_nil ch
    assert_equal 50, ch[:width_mm]
    assert_equal 100, ch[:depth_mm]
  end

  def test_architectural_moldings
    skirt = Catalog.find_profile('SKIRT-100x15')
    refute_nil skirt
    assert_equal 15, skirt[:width_mm]
    assert_equal 100, skirt[:depth_mm]
    assert_equal :bottom_left, skirt[:default_anchor]

    cornice = Catalog.find_profile('CORNICE-75x75')
    refute_nil cornice
    assert_equal :top_left, cornice[:default_anchor]
  end

  def test_profiles_by_category
    rc_beams = Catalog.profiles_by_category(:rc_beam)
    assert rc_beams.size >= 5
    wf_steels = Catalog.profiles_by_category(:steel_wf)
    assert wf_steels.size >= 8
  end
end
