# frozen_string_literal: true

require_relative '../test_helper'

class CatalogPlatformTest < Minitest::Test
  Library = JiraNot::ConstructFlow::Library

  def setup
    @runtime = build_test_runtime
    Library::Registration.install(@runtime)

    @generic_basin = Library::CatalogAssetDefinition.new(
      asset_id: 'basin-generic',
      version: '1',
      name: 'Generic Washbasin 600',
      asset_class: 'fixed_asset',
      category: 'sanitary',
      dimensions_mm: [600, 450, 850],
      host_capability: 'architecture.wall_host',
      connector_capabilities: %w[plumbing.cold_water plumbing.waste_outlet]
    )

    @mfg_basin_exact = Library::CatalogAssetDefinition.new(
      asset_id: 'basin-cotto-600',
      version: '1',
      name: 'Cotto Neo Washbasin 600',
      asset_class: 'fixed_asset',
      category: 'sanitary',
      manufacturer: 'Cotto',
      product: 'Neo Modern',
      sku: 'COT-NEO-600',
      dimensions_mm: [600, 450, 850],
      host_capability: 'architecture.wall_host',
      connector_capabilities: %w[plumbing.cold_water plumbing.waste_outlet],
      lod: { 'symbol' => {}, 'design' => {}, 'high' => {} }
    )

    @mfg_basin_wide = Library::CatalogAssetDefinition.new(
      asset_id: 'basin-cotto-900',
      version: '1',
      name: 'Cotto Neo Washbasin 900',
      asset_class: 'fixed_asset',
      category: 'sanitary',
      manufacturer: 'Cotto',
      sku: 'COT-NEO-900',
      dimensions_mm: [900, 500, 850],
      host_capability: 'architecture.wall_host',
      connector_capabilities: %w[plumbing.cold_water plumbing.waste_outlet]
    )

    @door_asset = Library::CatalogAssetDefinition.new(
      asset_id: 'door-swing-800',
      version: '1',
      name: 'Timber Door 800',
      asset_class: 'fixed_asset',
      category: 'door_window',
      dimensions_mm: [800, 100, 2000]
    )
  end

  def test_compatibility_engine_exact_match
    engine = Library::CompatibilityEngine.new
    res = engine.evaluate(source_asset: @generic_basin, candidate_asset: @mfg_basin_exact)

    assert res[:compatible]
    assert_equal :exact, res[:match_level]
    assert_equal :swap, res[:recommended_workflow]
    assert res[:generic_to_manufacturer]
    assert_empty res[:warnings]
    assert_empty res[:blocking_reasons]
  end

  def test_compatibility_engine_category_mismatch_blocks
    engine = Library::CompatibilityEngine.new
    res = engine.evaluate(source_asset: @generic_basin, candidate_asset: @door_asset)

    refute res[:compatible]
    assert_equal :incompatible, res[:match_level]
    assert_operator res[:blocking_reasons].length, :>=, 1
    assert_includes res[:blocking_reasons].first, 'Category mismatch'
  end

  def test_compatibility_engine_dimensional_difference_warns_and_recommends_replace
    engine = Library::CompatibilityEngine.new
    res = engine.evaluate(source_asset: @generic_basin, candidate_asset: @mfg_basin_wide)

    assert res[:compatible]
    assert_equal :compatible_with_warnings, res[:match_level]
    assert_equal :replace_construction, res[:recommended_workflow]
    assert_operator res[:warnings].length, :>=, 1
    assert_equal [300.0, 50.0, 0.0], res[:dimensional_delta_mm]
  end

  def test_variant_matrix_resolution
    matrix = Library::VariantMatrix.new(
      asset_id: 'wardrobe-system',
      axes: { 'width_mm' => [600, 800, 1000], 'finish' => %w[white oak walnut] },
      variants: [
        { 'options' => { 'width_mm' => 600, 'finish' => 'white' }, 'sku' => 'WR-600-W', 'price' => 5000 },
        { 'options' => { 'width_mm' => 800, 'finish' => 'oak' }, 'sku' => 'WR-800-O', 'price' => 7000 },
        { 'options' => { 'width_mm' => 1000, 'finish' => 'walnut' }, 'sku' => 'WR-1000-WN', 'price' => 9000 }
      ]
    )

    assert matrix.valid?
    found = matrix.resolve('width_mm' => 800, 'finish' => 'oak')
    assert found, 'should resolve exact variant'
    assert_equal 'WR-800-O', found['sku']
    assert_equal 7000, found['price']

    assert_nil matrix.resolve('width_mm' => 999, 'finish' => 'pink')
  end

  def test_lod_manager_switches_and_falls_back
    manager = Library::LodManager.new
    placed = Library::PlacedAssetDefinition.new(
      snapshot_id: 'snap-01',
      asset_id: 'basin-cotto-600',
      asset_version: '1',
      location_mm: [0, 0, 0],
      lod_key: 'design'
    )

    # Valid switch to available LOD
    high = manager.switch_lod(placed_asset: placed, target_lod: 'high', catalog_asset: @mfg_basin_exact)
    assert_equal 'high', high.lod_key

    # Switch to LOD not defined on asset ('construction') -> falls back to 'design'
    fallback = manager.switch_lod(placed_asset: placed, target_lod: 'construction', catalog_asset: @mfg_basin_exact)
    assert_equal 'design', fallback.lod_key
  end

  def test_library_commands_flow_end_to_end
    # 1. Register assets in store
    reg1 = @runtime.commands.execute('RegisterCatalogAsset', @generic_basin.to_h)
    assert_equal 'success', reg1[:status]

    reg2 = @runtime.commands.execute('RegisterCatalogAsset', @mfg_basin_exact.to_h)
    assert_equal 'success', reg2[:status]

    # 2. Evaluate compatibility command
    compat_res = @runtime.commands.execute(
      'EvaluateAssetCompatibility',
      {
        source_asset_id: @generic_basin.asset_id,
        candidate_asset_id: @mfg_basin_exact.asset_id
      }
    )
    assert_equal 'success', compat_res[:status], compat_res[:errors].join(', ')
    evt = compat_res[:events].find { |e| e[:name] == 'AssetCompatibilityEvaluated' }
    assert evt
    assert evt[:payload][:compatible]
    assert_equal :exact, evt[:payload][:match_level]

    # 3. Place fixed asset
    place_res = @runtime.commands.execute(
      'PlaceCatalogAsset',
      {
        asset_id: @mfg_basin_exact.asset_id,
        location_mm: [1000, 2000, 0],
        lod_key: 'design'
      }
    )
    assert_equal 'success', place_res[:status], place_res[:errors].join(', ')
    placed_id = place_res[:created_object_ids].first

    # 4. Switch LOD command
    lod_res = @runtime.commands.execute(
      'SwitchAssetLod',
      {
        object_id: placed_id,
        target_lod: 'high'
      }
    )
    assert_equal 'success', lod_res[:status], lod_res[:errors].join(', ')
    lod_evt = lod_res[:events].find { |e| e[:name] == 'AssetLodSwitched' }
    assert lod_evt
    assert_equal 'high', lod_evt[:payload][:lod_key]
  end
end
