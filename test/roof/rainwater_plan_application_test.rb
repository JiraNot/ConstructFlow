# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/geometry')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_catchment_planner')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_capacity_profile_resolver')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_planning_registration')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_plan_application')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/hosted_gutter_regenerator')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_registration')

class RainwaterPlanApplicationTest < Minitest::Test
  RoofObject = Struct.new(
    :id, :type, :owner_module, :entity, :created_phase, :source_state, :relationships,
    keyword_init: true
  )

  class SmartObjects
    attr_reader :objects, :dirty

    def initialize(objects)
      @objects = objects
      @dirty = []
      @by_entity = objects.each_with_object({}) { |object, result| result[object.entity] = object }
      @next_id = 1
    end

    def all = objects

    def fetch_by_id(id)
      objects.find { |object| object.id.to_s == id.to_s }
    end

    def fetch(entity)
      @by_entity[entity]
    end

    def create(entity:, type:, owner_module:, display_name: nil, created_phase:, source_state:, **_options)
      object = RoofObject.new(
        id: "gutter-#{@next_id}", type: type, owner_module: owner_module, entity: entity,
        created_phase: created_phase, source_state: source_state, relationships: []
      )
      @next_id += 1
      objects << object
      @by_entity[entity] = object
      object
    end

    def add_relationship(entity, kind:, target_id:, role:, metadata: {})
      object = @by_entity.fetch(entity)
      object.relationships << {
        'kind' => kind, 'target_id' => target_id, 'role' => role, 'metadata' => metadata
      }
    end

    def mark_dirty(entity, *flags)
      @dirty << [entity, flags]
      true
    end
  end

  class Geometry
    attr_reader :created, :rebuilt

    def initialize
      @created = []
      @rebuilt = []
    end

    def create_gutter_group(_model, roof_object:, definition:, edge_capability:)
      edge_capability.edge_points_mm(roof_object, definition.edge_index)
      entity = FakeEntity.new
      @created << [entity, roof_object.id, definition.edge_index]
      entity
    end

    def rebuild_gutter!(entity, roof_object:, definition:, edge_capability:)
      edge_capability.edge_points_mm(roof_object, definition.edge_index)
      @rebuilt << [entity, roof_object.id, definition.edge_index]
      entity
    end
  end

  class Capabilities
    def initialize(provider = nil)
      @provider = provider
    end

    def available?(id)
      id == 'drainage.rainwater_downpipe' && !@provider.nil?
    end

    def fetch(id)
      raise KeyError, id unless available?(id)
      @provider
    end
  end

  class Commands
    Registration = Struct.new(:validator, :handler, keyword_init: true)

    def initialize
      @registrations = {}
    end

    def registered?(name) = @registrations.key?(name.to_s)

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

  Runtime = Struct.new(
    :smart_objects, :connectors, :capabilities, :active_model, :commands,
    keyword_init: true
  )

  def roof_definition(width: 6000)
    JiraNot::ConstructFlow::Roof::RoofDefinition.new(
      boundary_mm: [[0, 0, 3000], [width, 0, 3000], [width, 4000, 3000], [0, 4000, 3000]],
      roof_form: 'lean_to', slope_percent: 5, slope_direction_xy: [0, 1],
      low_elevation_mm: 3000, covering_system: 'metal_sheet'
    )
  end

  def plan(capacity: 0.6)
    JiraNot::ConstructFlow::Roof::RainwaterCatchmentPlanner.new.plan(
      roof_definition: roof_definition,
      design_rainfall_mm_per_hr: 150,
      runoff_coefficient: 1.0,
      outlet_capacity_lps: capacity
    ).merge(
      'capacity_source' => {
        'kind' => 'manual_input',
        'verification_status' => 'user_supplied',
        'outlet_capacity_lps' => capacity
      }
    )
  end

  def setup_fixture
    repository = JiraNot::ConstructFlow::Roof::Repository.new
    roof_entity = FakeEntity.new
    roof = RoofObject.new(
      id: 'roof-1', type: 'roof.system', owner_module: 'constructflow.roof', entity: roof_entity,
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      source_state: 'confirmed', relationships: []
    )
    repository.write_roof(roof_entity, roof_definition)
    smart_objects = SmartObjects.new([roof])
    model = FakeModel.new
    connectors = JiraNot::ConstructFlow::Core::ConnectorRegistry.new.attach_model(model)
    connectors.register_compatibility(
      'roof.gutter_outlet', 'drainage.manhole_in', system: 'drainage.rainwater'
    )
    geometry = Geometry.new
    runtime = Runtime.new(
      smart_objects: smart_objects,
      connectors: connectors,
      capabilities: Capabilities.new,
      active_model: model,
      commands: Commands.new
    )
    [runtime, repository, geometry, roof]
  end

  def applier(runtime, repository, geometry)
    JiraNot::ConstructFlow::Roof::RainwaterPlanApplier.new(
      runtime: runtime, repository: repository, geometry: geometry
    )
  end

  def test_apply_two_outlet_plan_creates_one_gutter_and_two_semantic_outlets
    runtime, repository, geometry, roof = setup_fixture
    result = applier(runtime, repository, geometry).apply(
      roof_object: roof, plan: plan, profile_id: 'company.gutter.150'
    )

    assert_equal 1, result[:created_object_ids].length
    assert_equal 2, result[:outlet_connector_ids].length
    gutter = runtime.smart_objects.fetch_by_id(result[:gutter_object_id])
    definition = repository.read_gutter(gutter.entity)
    assert_equal 'company.gutter.150', definition.profile_id
    assert_equal result[:outlet_connector_ids].first, definition.outlet_connector_id
    assert_in_delta 1.0 / 3.0, definition.outlet_ratio, 0.0001

    outlets = result[:outlet_connector_ids].map { |id| runtime.connectors.connector(id) }
    assert_in_delta 2000.0, outlets[0]['position_mm'][0], 0.001
    assert_in_delta 4000.0, outlets[1]['position_mm'][0], 0.001
    assert_equal [0, 1], outlets.map { |outlet| outlet.dig('properties', 'outlet_index') }
    assert_equal [false, false], outlets.map { |outlet| outlet.dig('properties', 'retired_by_plan') }

    evidence = JiraNot::ConstructFlow::Core::AttributeStore.new(gutter.entity).read_json(
      JiraNot::ConstructFlow::Roof::RainwaterPlanApplier::EVIDENCE_KEY,
      nil,
      dictionary: JiraNot::ConstructFlow::Roof::Repository::DICTIONARY
    )
    assert_equal result[:outlet_connector_ids], evidence['outlet_connector_ids']
    assert_equal 2, evidence['required_outlet_count']
    refute_empty evidence['plan_fingerprint']
  end

  def test_reapply_preserves_gutter_and_connector_identity
    runtime, repository, geometry, roof = setup_fixture
    service = applier(runtime, repository, geometry)
    first = service.apply(roof_object: roof, plan: plan, profile_id: 'company.gutter.150')
    second = service.apply(roof_object: roof, plan: plan, profile_id: 'company.gutter.150')

    assert_empty second[:created_object_ids]
    assert_equal first[:gutter_object_id], second[:gutter_object_id]
    assert_equal first[:outlet_connector_ids], second[:outlet_connector_ids]
    assert_equal 1, runtime.smart_objects.objects.count { |object| object.type == 'roof.gutter' }
  end

  def test_shrinking_reviewed_plan_disables_surplus_unconnected_outlet
    runtime, repository, geometry, roof = setup_fixture
    service = applier(runtime, repository, geometry)
    first = service.apply(roof_object: roof, plan: plan(capacity: 0.6), profile_id: 'company.gutter.150')
    second = service.apply(roof_object: roof, plan: plan(capacity: 2.0), profile_id: 'company.gutter.150')

    assert_equal 1, second[:outlet_connector_ids].length
    assert_equal [first[:outlet_connector_ids][1]], second[:retired_connector_ids]
    retired = runtime.connectors.connector(first[:outlet_connector_ids][1])
    assert_equal 'disabled', retired['state']
    assert_equal true, retired.dig('properties', 'retired_by_plan')
  end

  def test_shrinking_plan_refuses_to_retire_a_connected_outlet
    runtime, repository, geometry, roof = setup_fixture
    service = applier(runtime, repository, geometry)
    first = service.apply(roof_object: roof, plan: plan(capacity: 0.6), profile_id: 'company.gutter.150')
    target = runtime.connectors.register_connector(
      owner_object_id: 'mh-1', type: 'drainage.manhole_in', role: 'inlet', position_mm: [4000, 0, 0]
    )
    runtime.connectors.register_connection(
      from_connector_id: first[:outlet_connector_ids][1],
      to_connector_id: target['id'],
      system: 'drainage.rainwater',
      metadata: { route_object_id: 'dp-2', route_kind: 'downpipe' }
    )

    errors = service.validate(
      roof_object: roof, plan: plan(capacity: 2.0), profile_id: 'company.gutter.150'
    )
    assert errors.any? { |message| message.include?('cannot retire connected gutter outlet') }
  end

  def test_hosted_regeneration_moves_every_active_planned_outlet
    runtime, repository, geometry, roof = setup_fixture
    result = applier(runtime, repository, geometry).apply(
      roof_object: roof, plan: plan, profile_id: 'company.gutter.150'
    )
    repository.write_roof(roof.entity, roof_definition(width: 9000))

    JiraNot::ConstructFlow::Roof::HostedGutterRegenerator.new(
      runtime: runtime, repository: repository, geometry: geometry
    ).refresh(roof)

    positions = result[:outlet_connector_ids].map { |id| runtime.connectors.connector(id)['position_mm'][0] }
    assert_in_delta 3000.0, positions[0], 0.001
    assert_in_delta 6000.0, positions[1], 0.001
  end

  def test_application_command_requires_confirmation_and_explicit_profile_for_manual_capacity
    runtime, _repository, _geometry, roof = setup_fixture
    JiraNot::ConstructFlow::Roof::RainwaterPlanApplicationRegistration.install(runtime)

    rejected = runtime.commands.execute(
      'ApplyRoofRainwaterCatchmentPlan',
      {
        roof_object_id: roof.id,
        design_rainfall_mm_per_hr: 150,
        runoff_coefficient: 1.0,
        outlet_capacity_lps: 0.6
      }
    )
    assert_equal 'rejected', rejected[:status]
    assert rejected[:errors].any? { |message| message.include?('confirm_apply') }

    no_profile = runtime.commands.execute(
      'ApplyRoofRainwaterCatchmentPlan',
      {
        roof_object_id: roof.id,
        design_rainfall_mm_per_hr: 150,
        runoff_coefficient: 1.0,
        outlet_capacity_lps: 0.6,
        confirm_apply: true
      }
    )
    assert_equal 'rejected', no_profile[:status]
    assert no_profile[:errors].any? { |message| message.include?('profile_id') }
  end

  def test_connect_downpipe_can_select_a_non_primary_gutter_outlet
    runtime, repository, geometry, roof = setup_fixture
    result = applier(runtime, repository, geometry).apply(
      roof_object: roof, plan: plan, profile_id: 'company.gutter.150'
    )
    gutter = runtime.smart_objects.fetch_by_id(result[:gutter_object_id])
    definition = repository.read_gutter(gutter.entity)
    selected = JiraNot::ConstructFlow::Roof::RainwaterRegistration.selected_outlet_connector(
      runtime,
      gutter,
      definition,
      { outlet_connector_id: result[:outlet_connector_ids][1] }
    )

    assert_equal result[:outlet_connector_ids][1], selected['id']
  end
end
