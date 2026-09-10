# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/manhole_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/pipe_route_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/validators/drainage_validator')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/quantity/drainage_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/route_candidate_evaluator')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/network_audit')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/quantity/project_takeoff')

DrainageQualityObject = Struct.new(:id, :type, :owner_module, :entity, :created_phase, :removed_phase, :source_state, keyword_init: true)

class DrainageQualityObjects
  def initialize(objects); @objects = objects; end
  def all; @objects; end
end

class DrainageQualityRepository
  def initialize(routes: {}, manholes: {}); @routes = routes; @manholes = manholes; end
  def read_pipe_route(entity); @routes[entity]; end
  def read_manhole(entity); @manholes[entity]; end
end

class DrainageQualityConnectors
  def initialize(connections = {}); @connections = connections; end
  def connection_for_route(id); @connections[id]; end
end

class DrainageNoCapabilities
  def fetch(_id); raise KeyError; end
end

class DrainageQualityRuntime
  attr_reader :smart_objects, :connectors, :capabilities
  def initialize(objects, connections = {})
    @smart_objects = DrainageQualityObjects.new(objects)
    @connectors = DrainageQualityConnectors.new(connections)
    @capabilities = DrainageNoCapabilities.new
  end
end

class DrainageQualityTakeoffTest < Minitest::Test
  def route(connection_id: 'conn-1', start_invert: 1000, end_invert: 900)
    JiraNot::ConstructFlow::Drainage::PipeRouteDefinition.new(
      system: 'waste', diameter_mm: 100, route_nodes_mm: [[0, 0, start_invert || 0], [5000, 0, end_invert || 0]],
      start_connector_id: 'start', end_connector_id: 'finish', start_invert_mm: start_invert,
      end_invert_mm: end_invert, material: 'pvc', connection_id: connection_id
    )
  end

  def test_network_audit_reports_missing_topology_connection
    entity = Object.new
    object = DrainageQualityObject.new(
      id: 'route-1', type: 'drainage.pipe_route', owner_module: 'constructflow.drainage', entity: entity,
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION, source_state: 'confirmed'
    )
    audit = JiraNot::ConstructFlow::Drainage::NetworkAudit.new(
      runtime: DrainageQualityRuntime.new([object]),
      repository: DrainageQualityRepository.new(routes: { entity => route })
    ).run
    assert_equal 'error', audit['status']
    assert audit['issues'].any? { |issue| issue['rule_id'] == 'drainage.route.connection_missing' }
  end

  def test_network_audit_keeps_unknown_invert_as_warning
    entity = Object.new
    object = DrainageQualityObject.new(
      id: 'route-1', type: 'drainage.pipe_route', owner_module: 'constructflow.drainage', entity: entity,
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION, source_state: 'verify_on_site'
    )
    definition = route(connection_id: nil, start_invert: nil, end_invert: nil)
    audit = JiraNot::ConstructFlow::Drainage::NetworkAudit.new(
      runtime: DrainageQualityRuntime.new([object]),
      repository: DrainageQualityRepository.new(routes: { entity => definition })
    ).run
    assert_equal 'warning', audit['status']
    assert audit['issues'].any? { |issue| issue['rule_id'] == 'drainage.route.invert_unknown' }
  end

  def test_takeoff_aggregates_by_phase_and_classification
    new_entity = Object.new
    demo_entity = Object.new
    objects = [
      DrainageQualityObject.new(id: 'new', type: 'drainage.pipe_route', owner_module: 'constructflow.drainage', entity: new_entity,
        created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION, removed_phase: nil, source_state: 'confirmed'),
      DrainageQualityObject.new(id: 'demo', type: 'drainage.pipe_route', owner_module: 'constructflow.drainage', entity: demo_entity,
        created_phase: JiraNot::ConstructFlow::Core::Phase::EXISTING, removed_phase: JiraNot::ConstructFlow::Core::Phase::DEMOLITION, source_state: 'confirmed')
    ]
    repo = DrainageQualityRepository.new(routes: { new_entity => route(connection_id: nil), demo_entity => route(connection_id: nil) })
    result = JiraNot::ConstructFlow::Drainage::Quantity::ProjectTakeoff.new(runtime: DrainageQualityRuntime.new(objects), repository: repo).build
    assert_equal 2, result['item_count']
    assert_equal %w[demolition new_construction], result['totals'].map { |item| item['phase_scope'] }.sort
    result['totals'].each { |item| assert_in_delta 5.0, item['value'], 0.001 }
  end
end
