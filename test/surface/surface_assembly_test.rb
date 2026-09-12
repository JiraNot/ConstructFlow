# frozen_string_literal: true

require_relative '../test_helper'

class SurfaceAssemblyTest < Minitest::Test
  Surface = JiraNot::ConstructFlow::Surface

  def test_assembly_layers_and_thickness_computation
    assembly = Surface::SurfaceAssemblyDefinition.new(
      id: 'asm-exterior-paver',
      name: 'Exterior Paver on Sand Bed & Concrete Base',
      layers: [
        { 'name' => 'Concrete Paver Block', 'thickness_mm' => 60.0, 'material_id' => 'paver_gray', 'owned_by_surface' => true },
        { 'name' => 'Bedding Sand', 'thickness_mm' => 30.0, 'material_id' => 'sand', 'owned_by_surface' => true },
        { 'name' => 'Crushed Stone Base', 'thickness_mm' => 100.0, 'material_id' => 'crushed_stone', 'owned_by_surface' => true },
        { 'name' => 'RC Slab Sub-base', 'thickness_mm' => 150.0, 'material_id' => 'rc_slab', 'owned_by_surface' => false }
      ]
    )

    assert assembly.valid?
    assert_equal 4, assembly.layer_count
    assert_in_delta 340.0, assembly.total_thickness_mm, 0.01
    assert_in_delta 190.0, assembly.total_finish_thickness_mm, 0.01
    assert_equal 3, assembly.surface_owned_layers.length
    assert_equal 1, assembly.structural_layers.length
  end

  def test_quantity_provider_emits_per_layer_quantities
    assembly = Surface::SurfaceAssemblyDefinition.new(
      id: 'asm-1',
      name: 'Paver Assembly',
      layers: [
        { 'name' => 'Paver', 'thickness_mm' => 50.0, 'material_id' => 'paver_1', 'owned_by_surface' => true },
        { 'name' => 'Structural Slab', 'thickness_mm' => 100.0, 'material_id' => 'conc', 'owned_by_surface' => false }
      ]
    )
    surface = Surface::SurfaceDefinition.new(
      outer_boundary_mm: [[0, 0, 0], [2000, 0, 0], [2000, 2000, 0], [0, 2000, 0]],
      surface_type: 'paver'
    )
    smart_obj = Struct.new(:id, :removed_phase, :created_phase, :source_state).new(
      'surface-1', nil, JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION, 'confirmed'
    )

    provider = Surface::Quantity::SurfaceQuantityProvider.new
    items = provider.assembly_quantities(
      smart_object: smart_obj,
      assembly_definition: assembly,
      surface_definition: surface
    )

    # Layer 1 (owned): 1 area item + 1 volume item = 2 items
    # Layer 2 (structural): 1 reference item = 1 item
    assert_equal 3, items.length

    paver_area = items.find { |i| i[:classification] == 'surface.assembly.layer.1.area' }
    paver_vol = items.find { |i| i[:classification] == 'surface.assembly.layer.1.volume' }
    slab_ref = items.find { |i| i[:classification] == 'surface.assembly.layer.2.structural_ref' }

    assert_in_delta 4.0, paver_area[:value], 0.001 # 2m x 2m = 4m2
    assert_in_delta 0.2, paver_vol[:value], 0.001  # 4m2 * 0.05m = 0.2m3
    assert_equal 0.0, slab_ref[:value]
    assert_equal 'ref', slab_ref[:unit]
  end
end
