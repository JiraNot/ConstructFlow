# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/route_planner')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/extension_command_registration')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/generator')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/orchestrator')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_quality_gate')

DrainageTransitionObject = Struct.new(:id, :type, :owner_module, :entity, :relationships, keyword_init: true)
DrainageTransitionPlan = Struct.new(:route_nodes_mm, :start_invert_mm, :end_invert_mm, :mode, :warnings, keyword_init: true)

class DrainageTransitionEntity < FakeAttributeCarrier
  attr_reader :erased

  def erase!
    @erased = true
    true
  end
end

class DrainageTransitionSmartObjects
  attr_reader :objects, :erased_ids

  def initialize(objects)
    @objects = objects
    @erased_ids = []
  end

  def all
    objects.dup
  end

  def erase!(entity)
    object = objects.find { |candidate| candidate.entity.equal?(entity) }
    raise KeyError, 'transition object not found' unless object

    entity.erase! if entity.respond_to?(:erase!)
    @erased_ids << object.id
    objects.delete(object)
    object
  end

  def mark_dirty(_entity, *_flags)
    true
  end

  def remove_relationship(entity, relationship_id: nil, kind: nil, target_id: nil)
    object = objects.find { |candidate| candidate.entity.equal?(entity) }
    before = object.relationships.length
    object.relationships.reject! do |relationship|
      id_match = relationship_id.nil? || relationship['id'].to_s == relationship_id.to_s
      kind_match = kind.nil? || relationship['kind'].to_s == kind.to_s
      target_match = target_id.nil? || relationship['target_id'].to_s == target_id.to_s
      id_match && kind_match && target_match
    end
    before - object.relationships.length
  end

  def add_relationship(entity, kind:, target_id:, role: nil, metadata: {})
    object = objects.find { |candidate| candidate.entity.equal?(entity) }
    relationship = {
      'kind' => kind.to_s,
      'target_id' => target_id.to_s,
      'role' => role&.to_s,
      'metadata' => metadata
    }
    object.relationships << relationship
    relationship
  end
end

class DrainageTransitionConnectors
  attr_reader :disconnects, :registrations

  def initialize(connectors:, connection:)
    @connectors = connectors.transform_keys(&:to_s)
    @connections = { connection.fetch('id').to_s => connection.dup }
    @disconnects = []
    @registrations = []
  end

  def connector(id)
    @connectors.fetch(id.to_s)
  end

  def connection(id)
    @connections.fetch(id.to_s)
  end

  def connection_for_route(route_object_id)
    @connections.values.find do |record|
      record.fetch('metadata', {})['route_object_id'].to_s == route_object_id.to_s
    end
  end

  def disconnect(id)
    @disconnects << id.to_s
    @connections.delete(id.to_s)
  end

  def register_connection(from_connector_id:, to_connector_id:, system:, metadata: {}, connection_id: nil)
    id = connection_id.to_s
    record = {
      'id' => id,
      'from_connector_id' => from_connector_id.to_s,
      'to_connector_id' => to_connector_id.to_s,
      'system' => system.to_s,
      'metadata' => metadata
    }
    @connections[id] = record
    @registrations << record.dup
    record
  end
end

class DrainageTransitionGeometry
  attr_reader :rebuilt

  def rebuild_pipe!(entity, definition)
    @rebuilt = [entity, definition]
    entity
  end
end

class DrainageTransitionPlanner
  def initialize(plan)
    @plan = plan
  end

  def plan(**_options)
    @plan
  end
end

DrainageTransitionRuntime = Struct.new(:smart_objects, :connectors)
ExtensionDrainageQualityObject = Struct.new(
  :id, :type, :owner_module, :entity, :relationships, :source_state,
  keyword_init: true
)

class ExtensionDrainageQualitySmartObjects
  def initialize(objects)
    @objects = objects
  end

  def all
    @objects.dup
  end

  def fetch_by_id(id)
    @objects.find { |object| object.id.to_s == id.to_s }
  end
end

class DrainageIntentTransitionTest < Minitest::Test
  def setup
    @entity = DrainageTransitionEntity.new
    @object = DrainageTransitionObject.new(
      id: 'route-1',
      type: 'drainage.pipe_route',
      owner_module: 'constructflow.drainage',
      entity: @entity,
      relationships: [
        {
          'kind' => 'generated_from',
          'target_id' => 'ext-1',
          'role' => 'extension_source',
          'metadata' => { 'slot' => 'primary_route', 'domain' => 'drainage' }
        },
        { 'kind' => 'connects_to', 'target_id' => 'fixture-old', 'role' => 'drainage_endpoint', 'metadata' => { 'connector_id' => 'c-start' } },
        { 'kind' => 'connects_to', 'target_id' => 'mh-old', 'role' => 'drainage_endpoint', 'metadata' => { 'connector_id' => 'c-end-old' } }
      ]
    )
    @smart_objects = DrainageTransitionSmartObjects.new([@object])
    @connectors = DrainageTransitionConnectors.new(
      connectors: {
        'c-start' => { 'id' => 'c-start', 'owner_object_id' => 'fixture-old', 'type' => 'drainage.rainwater', 'position_mm' => [0, 0, 100] },
        'c-end-old' => { 'id' => 'c-end-old', 'owner_object_id' => 'mh-old', 'type' => 'drainage.manhole_in', 'position_mm' => [1000, 0, 80] },
        'c-end-new' => { 'id' => 'c-end-new', 'owner_object_id' => 'mh-new', 'type' => 'drainage.manhole_in', 'position_mm' => [1200, 0, 76] }
      },
      connection: {
        'id' => 'conn-1',
        'from_connector_id' => 'c-start',
        'to_connector_id' => 'c-end-old',
        'system' => 'drainage.rainwater',
        'metadata' => { 'route_object_id' => 'route-1' }
      }
    )
    @runtime = DrainageTransitionRuntime.new(@smart_objects, @connectors)
    @repository = JiraNot::ConstructFlow::Drainage::Repository.new
    @repository.write_pipe_route(
      @entity,
      JiraNot::ConstructFlow::Drainage::PipeRouteDefinition.new(
        system: 'rainwater',
        route_nodes_mm: [[0, 0, 100], [1000, 0, 80]],
        start_connector_id: 'c-start',
        end_connector_id: 'c-end-old',
        start_invert_mm: 100,
        end_invert_mm: 80,
        route_strategy: 'semi_auto',
        connection_id: 'conn-1'
      )
    )
    @geometry = DrainageTransitionGeometry.new
    @validator = JiraNot::ConstructFlow::Drainage::Validators::DrainageValidator.new
    @planner = DrainageTransitionPlanner.new(
      DrainageTransitionPlan.new(
        route_nodes_mm: [[0, 0, 100], [1200, 0, 76]],
        start_invert_mm: 100,
        end_invert_mm: 76,
        mode: 'semi_auto',
        warnings: []
      )
    )
  end

  def command(config)
    JiraNot::ConstructFlow::Drainage::ExtensionCommandRegistration.generate_or_update(
      runtime: @runtime,
      input: {
        'extension_id' => 'ext-1',
        'intent' => { 'extension_id' => 'ext-1', 'config' => config }
      },
      repository: @repository,
      geometry: @geometry,
      validator: @validator,
      planner: @planner
    )
  end

  def test_explicit_enabled_false_disconnects_and_reconciles_generated_route
    result = command('enabled' => false)

    assert_equal ['route-1'], result[:removed_object_ids]
    assert_equal ['route-1'], @smart_objects.erased_ids
    assert_equal ['conn-1'], @connectors.disconnects
    assert_empty @smart_objects.objects
    assert_equal 'DrainageExtensionRouteRemoved', result[:events].first[:name]
  end

  def test_omitted_connectors_do_not_delete_existing_generated_route
    result = command({})

    assert_empty result[:removed_object_ids]
    assert_empty @smart_objects.erased_ids
    assert_equal [@object], @smart_objects.objects
    assert_equal 'connectors_omitted_existing_route_preserved', result[:events].first[:payload][:reason]
  end

  def test_endpoint_change_requires_explicit_reconnect
    error = assert_raises(ArgumentError) do
      command(
        'start_connector_id' => 'c-start',
        'end_connector_id' => 'c-end-new'
      )
    end

    assert_includes error.message, 'reconnect: true'
    assert_empty @connectors.disconnects
    assert_empty @connectors.registrations
  end

  def test_explicit_reconnect_preserves_route_and_connection_identity
    result = command(
      'start_connector_id' => 'c-start',
      'end_connector_id' => 'c-end-new',
      'reconnect' => true,
      'system' => 'rainwater'
    )

    assert_equal ['route-1'], result[:updated_object_ids]
    assert_empty result[:removed_object_ids]
    assert_equal ['conn-1'], @connectors.disconnects
    assert_equal 1, @connectors.registrations.length
    replacement = @connectors.registrations.first
    assert_equal 'conn-1', replacement['id']
    assert_equal 'c-end-new', replacement['to_connector_id']

    definition = @repository.read_pipe_route(@entity)
    assert_equal 'route-1', @object.id
    assert_equal 'conn-1', definition.connection_id
    assert_equal 'c-start', definition.start_connector_id
    assert_equal 'c-end-new', definition.end_connector_id
    assert_equal [[0.0, 0.0, 100.0], [1200.0, 0.0, 76.0]], definition.route_nodes_mm

    targets = @object.relationships.select { |relationship| relationship['kind'] == 'connects_to' }
                                  .map { |relationship| relationship['target_id'] }.sort
    assert_equal %w[fixture-old mh-new], targets
    assert_equal 'DrainageExtensionRouteReconnected', result[:events].first[:name]
  end

  def test_orchestrator_executes_explicit_disabled_drainage_as_reconciliation_step
    definition = JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
      boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]],
      program: 'carport',
      mode: 'construction'
    )
    plan = JiraNot::ConstructFlow::Extension::Orchestrator.new(
      JiraNot::ConstructFlow::Extension::Generator.new(definition)
    ).plan(
      'extension_id' => 'ext-1',
      'domains' => {
        'architecture' => { 'enabled' => false },
        'structure' => { 'enabled' => false },
        'surface' => { 'enabled' => false },
        'roof' => { 'enabled' => false },
        'drainage' => { 'enabled' => false },
        'interior' => { 'enabled' => false },
        'electrical' => { 'enabled' => false }
      }
    )

    assert_equal ['drainage'], plan['steps'].map { |step| step['domain'] }
    assert_equal 'reconcile_disabled_intent', plan['steps'].first['action']
    assert_equal false, plan['steps'].first.dig('intent', 'config', 'enabled')
  end

  def test_quality_gate_does_not_report_disabled_drainage_as_unresolved
    source = ExtensionDrainageQualityObject.new(
      id: 'ext-1',
      type: 'extension.zone',
      owner_module: 'constructflow.extension',
      entity: DrainageTransitionEntity.new,
      relationships: [],
      source_state: 'confirmed'
    )
    runtime = Struct.new(:smart_objects).new(ExtensionDrainageQualitySmartObjects.new([source]))
    execution = {
      'status' => 'success',
      'dirty_domains' => [],
      'steps' => [{
        'domain' => 'drainage',
        'status' => 'success',
        'errors' => [],
        'warnings' => [],
        'intent' => { 'config' => { 'enabled' => false } }
      }]
    }

    result = JiraNot::ConstructFlow::Extension::ConstructionQualityGate.new(runtime: runtime).run(
      extension_id: 'ext-1',
      execution: execution,
      strict: true
    )

    refute result['issues'].any? { |issue| issue['rule_id'] == 'construction.drainage.unresolved_intent' }
  end
end
