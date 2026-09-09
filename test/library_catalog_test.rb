# frozen_string_literal: true

require_relative 'test_helper'
require_relative '../apps/sketchup-extension/constructflow/modules/library/catalog_asset_definition'
require_relative '../apps/sketchup-extension/constructflow/modules/library/catalog_store'
require_relative '../apps/sketchup-extension/constructflow/modules/library/project_asset_snapshot'

class LibraryCatalogTest < Minitest::Test
  def setup
    @model = FakeModel.new
    @store = JiraNot::ConstructFlow::Library::CatalogStore.new(@model)
  end

  def asset(version: '1')
    JiraNot::ConstructFlow::Library::CatalogAssetDefinition.new(
      asset_id: 'window-aluminium-1200', version: version, name: 'Aluminium Window 1200',
      asset_class: 'parametric_asset', category: 'door_window',
      owner_module: 'constructflow.door_window', dimensions_mm: [1200, 100, 1500],
      tags: %w[window aluminium sliding],
      parameter_schema: { 'width' => { 'type' => 'number' } },
      placement_command: 'PlaceCatalogAsset'
    )
  end

  def test_asset_key_and_searchable_text_are_stable
    item = asset
    assert_equal 'window-aluminium-1200@1', item.key
    assert_includes item.searchable_text, 'aluminium'
    assert item.valid?
  end

  def test_round_trip_preserves_catalog_identity
    original = asset(version: '3')
    restored = JiraNot::ConstructFlow::Library::CatalogAssetDefinition.from_h(original.to_h)
    assert_equal original.key, restored.key
    assert_equal original.to_h, restored.to_h
  end

  def test_parametric_asset_requires_placement_command
    invalid = JiraNot::ConstructFlow::Library::CatalogAssetDefinition.new(
      asset_id: 'bad', version: '1', name: 'Bad', asset_class: 'parametric_asset', category: 'test'
    )
    refute invalid.valid?
    assert_includes invalid.errors, 'parametric asset requires placement command'
  end

  def test_store_returns_latest_version_and_searches
    @store.register_asset(asset(version: '1'))
    @store.register_asset(asset(version: '2'))
    assert_equal '2', @store.asset('window-aluminium-1200').version
    results = @store.search(query: 'aluminium')
    assert_equal ['window-aluminium-1200@1', 'window-aluminium-1200@2'],
                 results.map { |item| item['definition'].key }.sort
  end

  def test_project_snapshot_survives_catalog_version_change
    @store.register_asset(asset(version: '1'))
    snapshot = @store.add_to_project_library(asset_id: 'window-aluminium-1200', version: '1', pin: true)
    @store.register_asset(asset(version: '2'))
    restored = @store.project_snapshot(snapshot.snapshot_id)
    assert_equal 'window-aluminium-1200', restored.asset_id
    assert_equal '1', restored.asset_version
    assert restored.pinned
  end
end
