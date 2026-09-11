# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/library/catalog_asset_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_catchment_planner')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_capacity_profile_resolver')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_planning_registration')

class RainwaterCapacityCatalogTest < Minitest::Test
  CapacityRoofObject = Struct.new(:id, :entity, :owner_module, :type, keyword_init: true)

  class CapacityCatalogProvider
    def initialize(asset)
      @asset = asset
    end

    def asset(asset_id, version: nil)
      raise KeyError, asset_id unless asset_id.to_s == @asset.asset_id
      raise KeyError, version if version && version.to_s != @asset.version
      @asset
    end
  end

  class CapacityCapabilities
    def initialize(provider = nil)
      @provider = provider
    end

    def available?(id)
      id.to_s == 'library.catalog' && !@provider.nil?
    end

    def fetch(id)
      raise KeyError, id unless available?(id)
      @provider
    end
  end

  class CapacitySmartObjects
    def initialize(object)
      @object = object
    end

    def fetch_by_id(id)
      @object if id.to_s == @object.id.to_s
    end

    def fetch(entity)
      @object if entity.equal?(@object.entity)
    end
  end

  class CapacityCommands
    Registration = Struct.new(:validator, :handler, keyword_init: true)

    def initialize
      @registrations = {}
    end

    def registered?(name)
      @registrations.key?(name.to_s)
    end

    def register(name, **options, &block)
      @registrations[name.to_s] = Registration.new(validator: options[:validator], handler: block)
    end

    def execute(name, input)
      registration = @registrations.fetch(name.to_s)
      command = { input: input }
      errors = Array(registration.validator&.call(command))
      return { status: 'rejected', errors: errors } unless errors.empty?

      registration.handler.call(command).merge(status: 'success')
    end
  end

  def roof_definition
    JiraNot::ConstructFlow::Roof::RoofDefinition.new(
      boundary_mm: [[0, 0, 3000], [6000, 0, 3000], [6000, 4000, 3000], [0, 4000, 3000]],
      roof_form: 'lean_to',
      slope_percent: 5,
      slope_direction_xy: [0, 1],
      low_elevation_mm: 3000,
      covering_system: 'metal_sheet'
    )
  end

  def capacity_asset(verification_status: 'verified', category: 'roof.rainwater_capacity', capacity: 0.6)
    JiraNot::ConstructFlow::Library::CatalogAssetDefinition.new(
      asset_id: 'rw-cap-90',
      version: '2026.1',
      name: 'Verified RW Outlet 90',
      asset_class: 'product',
      category: category,
      owner_module: 'constructflow.library',
      manufacturer: 'Example Manufacturer',
      product: 'RW Outlet 90',
      sku: 'RW90',
      metadata: {
        hydraulic: {
          verification_status: verification_status,
          basis_ref: 'datasheet:rw90-rev3',
          outlet_capacity_lps: capacity,
          downpipe_diameter_mm: 90,
          gutter_profile_id: 'box.150'
        }
      }
    )
  end

  def resolver_runtime(asset = capacity_asset)
    Struct.new(:capabilities).new(CapacityCapabilities.new(CapacityCatalogProvider.new(asset)))
  end

  def test_resolver_returns_versioned_verified_capacity_evidence
    result = JiraNot::ConstructFlow::Roof::RainwaterCapacityProfileResolver.new.resolve(
      runtime: resolver_runtime,
      asset_id: 'rw-cap-90',
      version: '2026.1'
    )

    assert_equal 'catalog_asset', result['kind']
    assert_equal 'rw-cap-90', result['asset_id']
    assert_equal '2026.1', result['asset_version']
    assert_equal 'verified', result['verification_status']
    assert_equal 'datasheet:rw90-rev3', result['basis_ref']
    assert_in_delta 0.6, result['outlet_capacity_lps'], 0.0001
    assert_in_delta 90.0, result['downpipe_diameter_mm'], 0.0001
    assert_equal 'box.150', result['gutter_profile_id']
  end

  def test_resolver_rejects_unverified_or_wrong_category_assets
    unverified = resolver_runtime(capacity_asset(verification_status: 'assumed'))
    error = assert_raises(ArgumentError) do
      JiraNot::ConstructFlow::Roof::RainwaterCapacityProfileResolver.new.resolve(
        runtime: unverified, asset_id: 'rw-cap-90'
      )
    end
    assert_includes error.message, 'must be verified'

    wrong_category = resolver_runtime(capacity_asset(category: 'roof.gutter'))
    error = assert_raises(ArgumentError) do
      JiraNot::ConstructFlow::Roof::RainwaterCapacityProfileResolver.new.resolve(
        runtime: wrong_category, asset_id: 'rw-cap-90'
      )
    end
    assert_includes error.message, 'roof.rainwater_capacity'
  end

  def test_resolver_requires_hydraulic_basis_and_positive_capacity
    missing_basis = JiraNot::ConstructFlow::Library::CatalogAssetDefinition.new(
      asset_id: 'rw-cap-90', version: '2026.1', name: 'RW90', asset_class: 'product',
      category: 'roof.rainwater_capacity',
      metadata: { hydraulic: { verification_status: 'verified', outlet_capacity_lps: 0.6 } }
    )
    error = assert_raises(ArgumentError) do
      JiraNot::ConstructFlow::Roof::RainwaterCapacityProfileResolver.new.resolve(
        runtime: resolver_runtime(missing_basis), asset_id: 'rw-cap-90'
      )
    end
    assert_includes error.message, 'basis_ref'

    zero_capacity = resolver_runtime(capacity_asset(capacity: 0))
    error = assert_raises(ArgumentError) do
      JiraNot::ConstructFlow::Roof::RainwaterCapacityProfileResolver.new.resolve(
        runtime: zero_capacity, asset_id: 'rw-cap-90'
      )
    end
    assert_includes error.message, 'greater than zero'
  end

  def test_planning_command_uses_catalog_capacity_and_preserves_traceability
    entity = FakeEntity.new
    JiraNot::ConstructFlow::Roof::Repository.new.write_roof(entity, roof_definition)
    roof = CapacityRoofObject.new(
      id: 'roof-1', entity: entity,
      owner_module: 'constructflow.roof', type: 'roof.system'
    )
    commands = CapacityCommands.new
    runtime = Struct.new(:commands, :smart_objects, :capabilities).new(
      commands,
      CapacitySmartObjects.new(roof),
      CapacityCapabilities.new(CapacityCatalogProvider.new(capacity_asset))
    )
    JiraNot::ConstructFlow::Roof::RainwaterPlanningRegistration.install(runtime)

    result = commands.execute(
      'PlanRoofRainwaterCatchment',
      {
        roof_object_id: 'roof-1',
        design_rainfall_mm_per_hr: 150,
        runoff_coefficient: 1.0,
        capacity_asset_id: 'rw-cap-90',
        capacity_asset_version: '2026.1'
      }
    )

    assert_equal 'success', result[:status]
    payload = result[:events].first[:payload]
    assert_equal 2, payload['required_outlet_count']
    assert_equal 'catalog_asset', payload.dig('capacity_source', 'kind')
    assert_equal 'rw-cap-90', payload.dig('capacity_source', 'asset_id')
    assert_equal '2026.1', payload.dig('capacity_source', 'asset_version')
    assert_equal 'datasheet:rw90-rev3', payload.dig('capacity_source', 'basis_ref')
  end

  def test_manual_capacity_still_works_but_conflicting_capacity_sources_are_rejected
    entity = FakeEntity.new
    JiraNot::ConstructFlow::Roof::Repository.new.write_roof(entity, roof_definition)
    roof = CapacityRoofObject.new(
      id: 'roof-1', entity: entity,
      owner_module: 'constructflow.roof', type: 'roof.system'
    )
    commands = CapacityCommands.new
    runtime = Struct.new(:commands, :smart_objects, :capabilities).new(
      commands,
      CapacitySmartObjects.new(roof),
      CapacityCapabilities.new(CapacityCatalogProvider.new(capacity_asset))
    )
    JiraNot::ConstructFlow::Roof::RainwaterPlanningRegistration.install(runtime)

    manual = commands.execute(
      'PlanRoofRainwaterCatchment',
      {
        roof_object_id: 'roof-1', design_rainfall_mm_per_hr: 150,
        runoff_coefficient: 1.0, outlet_capacity_lps: 0.6
      }
    )
    assert_equal 'success', manual[:status]
    assert_equal 'manual_input', manual[:events].first[:payload].dig('capacity_source', 'kind')

    conflict = commands.execute(
      'PlanRoofRainwaterCatchment',
      {
        roof_object_id: 'roof-1', design_rainfall_mm_per_hr: 150,
        runoff_coefficient: 1.0, outlet_capacity_lps: 0.6,
        capacity_asset_id: 'rw-cap-90'
      }
    )
    assert_equal 'rejected', conflict[:status]
    assert_includes conflict[:errors].first, 'either outlet_capacity_lps or capacity_asset_id'
  end
end
