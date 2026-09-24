# frozen_string_literal: true

require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/wall_build_up'

class WallBuildUpTest < Minitest::Test
  BuildUp = JiraNot::ConstructFlow::Architecture::WallBuildUp

  def test_layers_sum_exactly_to_wall_thickness
    [100, 150, 200, 230, 90].each do |thickness|
      layers = BuildUp.layers_for(thickness, 'generic.wall.100')

      total = layers.sum { |layer| layer[:thickness_mm] }
      assert_equal Float(thickness), total, "layers must sum to #{thickness}"
      assert(layers.all? { |layer| layer[:thickness_mm].positive? })
    end
  end

  def test_default_build_up_is_plaster_core_plaster
    layers = BuildUp.layers_for(100, 'generic.wall.100')

    assert_equal(%w[finish core finish], layers.map { |layer| layer[:role] })
    assert_equal 'CF AAC Block', layers[1][:material]
    assert_in_delta 70.0, layers[1][:thickness_mm]
  end

  def test_wall_type_selects_build_up_family
    assert_equal 'brick', BuildUp.build_up_for('brick.wall.230')
    assert_equal 'aac', BuildUp.build_up_for('generic.wall.100')
    assert_equal 'concrete', BuildUp.build_up_for('rc.wall.200')
    assert_equal 'precast', BuildUp.build_up_for('precast.panel.150')
  end

  def test_brick_wall_thickness_is_split_into_core_and_skins
    layers = BuildUp.layers_for(230, 'brick.wall.230')

    assert_equal 'CF Brick', layers.find { |layer| layer[:role] == 'core' }[:material]
    assert_equal(Float(230), layers.sum { |layer| layer[:thickness_mm] })
  end

  def test_thin_walls_collapse_to_single_core_layer
    layers = BuildUp.layers_for(10, 'generic.wall.100')

    assert_equal 1, layers.length
    assert_equal 'core', layers.first[:role]
    assert_equal 10.0, layers.first[:thickness_mm]
  end

  def test_unknown_type_falls_back_to_default_build_up
    layers = BuildUp.layers_for(120, 'mystery.type')

    assert_equal(Float(120), layers.sum { |layer| layer[:thickness_mm] })
    assert(layers.length > 1)
  end
end
