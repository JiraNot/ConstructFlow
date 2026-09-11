# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/drawing_issue_set')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/cabinet_run_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/quantity/interior_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/device_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/quantity/electrical_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/downpipe_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/geometry')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/plan_representation_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_catchment_planner')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_capacity_profile_resolver')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_planning_registration')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_plan_application')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_package_integration')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_takeoff')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_quality_gate')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_issue_set_factory')

RainwaterPackageObject = Struct.new(
  :id, :type, :owner_module, :entity, :created_phase, :removed_phase,
  :source_state, :relationships, :display_name,
  keyword_init: true
)

class RainwaterPackageSmartObjects
  attr_reader :objects

  def initialize(objects = [])
    @objects = []
    @by_entity = {}
    @next_id = 1
    objects.each { |object| seed(object) }
  end

  def seed(object)
    objects << object
    @by_entity[object.entity] = object
    object
  end

  def all = objects

  def fetch_by_id(id)
    objects.find { |object| object.id.to_s == id.to_s }
  end

  def fetch(entity)
    @by_entity[entity]
  end

  def create(entity:, type:, owner_module:, display_name: nil, created_phase:, source_state:, **_options)
    object = RainwaterPackageObject.new(
      id: "generated-rw-#{@next_id}", type: type, owner_module: owner_module,
      entity: entity, created_phase: created_phase, removed_phase: nil,
      source_state: source_state, relationships: [], display_name: display_name || type
    )
    @next_id += 1
    seed(object)
  end

  def add_relationship(entity, kind:, target_id:, role: nil, metadata: {})
    object = @by_entity.fetch(entity)
    object.relationships << {
      'kind' => kind.to_s,
      'target_id' => target_id.to_s,
      'role' => role&.to_s,
      'metadata' => metadata
    }
  end

  def mark_dirty(_entity, *_flags) = true
end

class RainwaterPackageGeometry
  def create_gutter_group(_model, roof_object:, definition:, edge_capability:)
    edge_capability.edge_points_mm(roof_object, definition.edge_index)
    FakeEntity.new
  end

  def rebuild_gutter!(entity, roof_object:, definition:, edge_capability:)
    edge_capability.edge_points_mm(roof_object, definition.edge_index)
    entity
  end
end

RainwaterPackageRuntime = Struct.new(
  :smart_objects, :connectors, :capabilities, :active_model,
  keyword_init: true
)

class ConstructionRainwaterPackageTest < Minitest::Test
  def setup
    @model = FakeModel.new
    @connectors = JiraNot::ConstructFlow::Core::ConnectorRegistry.new.attach_model(@model)
    @connectors.register_compatibility(
      'roof.gutter_outlet', 'drainage.manhole_in', system: 'drainage.rainwater'
    )
    @extension_entity = FakeEntity.new
    @roof_entity = FakeEntity.new
    @extension = object(
      id: 'ext-1', type: 'extension.zone', owner: 'constructflow.extension',
      entity: @extension_entity, relationships: [], display_name: 'Extension'
    )
    @roof = object(
      id: 'roof-1', type: 'roof.system', owner: 'constructflow.roof',
      entity: @roof_entity, relationships: generated_from('ext-1'), display_name: 'Extension Roof'
    )
    @objects = RainwaterPackageSmartObjects.new([@extension, @roof])
    @runtime = RainwaterPackageRuntime.new(
      smart_objects: @objects,
      connectors: @connectors,
      capabilities: Class.new do
        def available?(_id) = false
      end.new,
      active_model: @model
    )
    @roof_repository = JiraNot::ConstructFlow::Roof::Repository.new
    @roof_repository.write_roof(@roof_entity, roof_definition)
    JiraNot::ConstructFlow::Extension::Repository.new.write(
      @extension_entity,
      JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
        boundary_mm: [[0, 0, 0], [6000, 0, 0], [6000, 4000, 0], [0, 4000, 0]],
        program: 'carport', mode: 'construction', roof_intent: 'lean_to'
      )
    )
  end

  def object(id:, type:, owner:, entity: FakeEntity.new, relationships:, display_name: nil)
    RainwaterPackageObject.new(
      id: id, type: type, owner_module: owner, entity: entity,
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil, source_state: 'confirmed', relationships: relationships,
      display_name: display_name || id
    )
  end

  def generated_from(id)
    [{ 'kind' => 'generated_from', 'target_id' => id, 'role' => 'extension_source' }]
  end

  def roof_definition
    JiraNot::ConstructFlow::Roof::RoofDefinition.new(
      boundary_mm: [[0, 0, 3000], [6000, 0, 3000], [6000, 4000, 3000], [0, 4000, 3000]],
      roof_form: 'lean_to', slope_percent: 5, slope_direction_xy: [0, 1],
      low_elevation_mm: 3000, covering_system: 'metal_sheet', generated_from_id: 'ext-1'
    )
  end

  def reviewed_plan
    JiraNot::ConstructFlow::Roof::RainwaterCatchmentPlanner.new.plan(
      roof_definition: roof_definition,
      design_rainfall_mm_per_hr: 150,
      runoff_coefficient: 1.0,
      outlet_capacity_lps: 0.6
    ).merge(
      'capacity_source' => {
        'kind' => 'manual_input',
        'verification_status' => 'user_supplied',
        'outlet_capacity_lps' => 0.6
      }
    )
  end

  def apply_plan
    JiraNot::ConstructFlow::Roof::RainwaterPlanApplier.new(
      runtime: @runtime,
      repository: @roof_repository,
      geometry: RainwaterPackageGeometry.new
    ).apply(
      roof_object: @roof,
      plan: reviewed_plan,
      profile_id: 'company.gutter.150'
    )
  end

  def test_applied_gutter_enters_extension_scope_takeoff_and_roof_drawing_scope
    result = apply_plan
    gutter = @objects.fetch_by_id(result[:gutter_object_id])
    assert gutter.relationships.any? do |relationship|
      relationship['kind'] == 'generated_from' && relationship['target_id'] == 'ext-1'
    end

    takeoff = JiraNot::ConstructFlow::Extension::ConstructionTakeoff.new(runtime: @runtime).build('ext-1')
    coverage = takeoff['coverage'].find { |item| item['object_id'] == gutter.id }
    assert_equal 'included', coverage['status']
    gutter_total = takeoff['totals'].find { |item| item['classification'] == 'roof.gutter.length' }
    assert_in_delta 6.0, gutter_total['value'], 0.0001
    assert_equal [gutter.id], gutter_total['source_object_ids']

    factory = JiraNot::ConstructFlow::Extension::ConstructionIssueSetFactory.new(runtime: @runtime)
    assert_equal [gutter.id, 'roof-1'].sort, factory.object_ids_for_family(extension_id: 'ext-1', family: 'roof')
  end

  def test_roof_plan_representation_emits_every_active_outlet
    result = apply_plan
    gutter = @objects.fetch_by_id(result[:gutter_object_id])
    representation = JiraNot::ConstructFlow::Roof::PlanRepresentationProvider.new(
      runtime: @runtime, repository: @roof_repository
    ).render(
      object: gutter,
      request: {
        'view' => 'plan', 'scale' => '1:50', 'phase_view' => 'proposed', 'lod' => 'construction',
        'context' => { 'style_preset' => 'roof.construction' }
      }
    )

    outlets = representation[:primitives].select { |primitive| primitive['role'] == 'gutter_outlet' }
    assert_equal 2, outlets.length
    assert_equal result[:outlet_connector_ids].sort, outlets.map { |primitive| primitive['connector_id'] }.sort
    assert_equal 2, representation[:metadata]['outlet_count']
  end

  def test_strict_package_qa_blocks_unconnected_applied_outlets_and_clears_after_scoped_downpipes_exist
    result = apply_plan
    execution = { 'status' => 'success', 'steps' => [], 'dirty_domains' => [] }
    gate = JiraNot::ConstructFlow::Extension::ConstructionQualityGate.new(runtime: @runtime)

    blocked = gate.run(extension_id: 'ext-1', execution: execution, strict: true)
    refute blocked['publishable']
    unconnected = blocked['issues'].select { |issue| issue['rule_id'] == 'construction.rainwater.outlet_unconnected' }
    assert_equal 2, unconnected.length

    drainage_repository = JiraNot::ConstructFlow::Drainage::Repository.new
    result[:outlet_connector_ids].each_with_index do |outlet_id, index|
      outlet = @connectors.connector(outlet_id)
      target = @connectors.register_connector(
        owner_object_id: "mh-#{index + 1}", type: 'drainage.manhole_in', role: 'inlet',
        position_mm: [1000 + (index * 2000), 0, 0]
      )
      downpipe_entity = FakeEntity.new
      downpipe = object(
        id: "dp-#{index + 1}", type: 'drainage.downpipe', owner: 'constructflow.drainage',
        entity: downpipe_entity, relationships: generated_from('ext-1')
      )
      @objects.seed(downpipe)
      connection = @connectors.register_connection(
        from_connector_id: outlet_id,
        to_connector_id: target['id'],
        system: 'drainage.rainwater',
        metadata: { route_object_id: downpipe.id, route_kind: 'downpipe' }
      )
      drainage_repository.write_downpipe(
        downpipe_entity,
        JiraNot::ConstructFlow::Drainage::DownpipeDefinition.new(
          route_nodes_mm: [outlet.fetch('position_mm'), target.fetch('position_mm')],
          start_connector_id: outlet_id,
          end_connector_id: target['id'],
          connection_id: connection['id']
        )
      )
    end

    clear = gate.run(extension_id: 'ext-1', execution: execution, strict: true)
    assert clear['publishable']
    refute clear['issues'].any? { |issue| issue['rule_id'].start_with?('construction.rainwater.') }
  end

  def test_qa_rejects_connected_downpipe_outside_extension_scope
    result = apply_plan
    outlet_id = result[:outlet_connector_ids].first
    target = @connectors.register_connector(
      owner_object_id: 'mh-foreign', type: 'drainage.manhole_in', role: 'inlet', position_mm: [0, 0, 0]
    )
    foreign = object(
      id: 'dp-foreign', type: 'drainage.downpipe', owner: 'constructflow.drainage', relationships: []
    )
    @objects.seed(foreign)
    @connectors.register_connection(
      from_connector_id: outlet_id,
      to_connector_id: target['id'],
      system: 'drainage.rainwater',
      metadata: { route_object_id: foreign.id, route_kind: 'downpipe' }
    )

    gate = JiraNot::ConstructFlow::Extension::ConstructionQualityGate.new(runtime: @runtime)
    qa = gate.run(
      extension_id: 'ext-1',
      execution: { 'status' => 'success', 'steps' => [], 'dirty_domains' => [] },
      strict: true
    )
    assert qa['issues'].any? { |issue| issue['rule_id'] == 'construction.rainwater.downpipe_out_of_scope' }
    refute qa['publishable']
  end
end
