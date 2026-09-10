# frozen_string_literal: true

require 'minitest/autorun'
require_relative '../../apps/sketchup-extension/constructflow/core/representation_registry'
require_relative '../../apps/sketchup-extension/constructflow/modules/drainage/pipe_route_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/drainage/manhole_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/drainage/plan_representation_provider'

class DrainagePlanRepresentationProviderTest < Minitest::Test
  FakeObject = Struct.new(:id, :type, :entity)

  class FakeRepository
    def initialize(pipe_route: nil, manhole: nil)
      @pipe_route = pipe_route
      @manhole = manhole
    end

    def read_pipe_route(_entity) = @pipe_route
    def read_manhole(_entity) = @manhole
  end

  def pipe_definition
    JiraNot::ConstructFlow::Drainage::PipeRouteDefinition.new(
      system: 'waste',
      route_nodes_mm: [[0, 0, 0], [2000, 0, 0], [4000, 1000, 0]],
      start_connector_id: 'fixture-1', end_connector_id: 'mh-1',
      diameter_mm: 100, start_invert_mm: -300, end_invert_mm: -360,
      route_strategy: 'semi_auto', connection_id: 'net-1'
    )
  end

  def provider_for(pipe_route: nil, manhole: nil)
    JiraNot::ConstructFlow::Drainage::PlanRepresentationProvider.new(
      repository: FakeRepository.new(pipe_route: pipe_route, manhole: manhole)
    )
  end

  def test_construction_pipe_contains_flow_size_slope_and_inverts
    payload = provider_for(pipe_route: pipe_definition).render(
      object: FakeObject.new('pipe-1', 'drainage.pipe_route', Object.new),
      request: { 'view' => 'plumbing_plan', 'scale' => '1:50', 'phase_view' => 'proposed', 'lod' => 'construction', 'context' => { 'style_preset' => 'plumbing.construction' } }
    )
    roles = payload[:primitives].map { |item| item['role'] }
    annotations = payload[:annotations].map { |item| item['role'] }
    assert_includes roles, 'pipe_centerline'
    assert_includes roles, 'flow_direction'
    %w[pipe_size pipe_system slope invert_start invert_end].each { |role| assert_includes annotations, role }
    refute_includes annotations, 'route_strategy'
    assert_equal 'construction', payload[:metadata]['representation_profile']
  end

  def test_simple_pipe_is_intentionally_reduced
    payload = provider_for(pipe_route: pipe_definition).render(
      object: FakeObject.new('pipe-1', 'drainage.pipe_route', Object.new),
      request: { 'view' => 'plumbing_simple', 'scale' => '1:100', 'phase_view' => 'coordination', 'lod' => 'simple', 'context' => { 'style_preset' => 'plumbing.simple' } }
    )
    roles = payload[:primitives].map { |item| item['role'] }
    annotations = payload[:annotations].map { |item| item['role'] }
    assert_equal ['pipe_centerline'], roles
    assert_equal ['pipe_size'], annotations
    assert_equal 'simple', payload[:metadata]['representation_profile']
  end

  def test_coordination_pipe_adds_route_and_network_context
    payload = provider_for(pipe_route: pipe_definition).render(
      object: FakeObject.new('pipe-1', 'drainage.pipe_route', Object.new),
      request: { 'view' => 'plumbing_coordination', 'scale' => '1:50', 'phase_view' => 'coordination', 'lod' => 'coordination', 'context' => { 'style_preset' => 'plumbing.coordination' } }
    )
    annotations = payload[:annotations].map { |item| item['role'] }
    assert_includes annotations, 'route_strategy'
    assert_includes annotations, 'connection_id'
    assert_equal 'coordination', payload[:metadata]['representation_profile']
  end

  def test_unknown_pipe_invert_is_explicitly_marked_for_verification
    definition = JiraNot::ConstructFlow::Drainage::PipeRouteDefinition.new(
      system: 'rainwater', route_nodes_mm: [[0, 0, 0], [3000, 0, 0]],
      start_connector_id: 'dp-1', end_connector_id: 'mh-1', diameter_mm: 100
    )
    payload = provider_for(pipe_route: definition).render(
      object: FakeObject.new('pipe-rw-1', 'drainage.pipe_route', Object.new),
      request: { 'view' => 'rainwater_plan', 'scale' => '1:50', 'phase_view' => 'proposed', 'lod' => 'construction', 'context' => {} }
    )
    slope = payload[:annotations].find { |item| item['role'] == 'slope_unknown' }
    refute_nil slope
    assert_equal 'verify', slope['status']
    assert_equal false, payload[:metadata]['invert_known']
  end

  def test_manhole_detail_changes_by_profile
    definition = JiraNot::ConstructFlow::Drainage::ManholeDefinition.new(
      location_mm: [5000, 2000, 100], size_mm: [600, 600], cover_level_mm: 100,
      invert_in_mm: -700, invert_out_mm: -750, manhole_type: 'inspection'
    )
    provider = provider_for(manhole: definition)
    object = FakeObject.new('mh-1', 'drainage.manhole', Object.new)

    simple = provider.render(object: object, request: { 'lod' => 'simple', 'context' => { 'style_preset' => 'plumbing.simple' } })
    construction = provider.render(object: object, request: { 'lod' => 'construction', 'context' => { 'style_preset' => 'plumbing.construction' } })
    coordination = provider.render(object: object, request: { 'lod' => 'coordination', 'context' => { 'style_preset' => 'plumbing.coordination' } })

    assert_equal ['object_tag'], simple[:annotations].map { |item| item['role'] }
    %w[cover_level invert_in invert_out depth].each { |role| assert_includes construction[:annotations].map { |item| item['role'] }, role }
    assert_includes coordination[:annotations].map { |item| item['role'] }, 'manhole_type'
  end
end
