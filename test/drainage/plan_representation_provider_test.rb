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

    def read_pipe_route(_entity)
      @pipe_route
    end

    def read_manhole(_entity)
      @manhole
    end
  end

  def test_pipe_plan_contains_centerline_flow_size_slope_and_inverts
    definition = JiraNot::ConstructFlow::Drainage::PipeRouteDefinition.new(
      system: 'waste',
      route_nodes_mm: [[0, 0, 0], [2000, 0, 0], [4000, 1000, 0]],
      start_connector_id: 'fixture-1',
      end_connector_id: 'mh-1',
      diameter_mm: 100,
      start_invert_mm: -300,
      end_invert_mm: -360,
      route_strategy: 'semi_auto'
    )
    provider = JiraNot::ConstructFlow::Drainage::PlanRepresentationProvider.new(
      repository: FakeRepository.new(pipe_route: definition)
    )
    registry = JiraNot::ConstructFlow::Core::RepresentationRegistry.new
    registry.register(
      object_type: 'drainage.pipe_route',
      kind: 'plan',
      owner_module: 'constructflow.drainage',
      provider: provider
    )
    object = FakeObject.new('pipe-1', 'drainage.pipe_route', Object.new)

    result = registry.render(
      object: object,
      kind: 'plan',
      view: 'plumbing_plan',
      scale: '1:50',
      phase_view: 'proposed',
      lod: 'construction'
    )

    roles = result['primitives'].map { |item| item['role'] }
    annotation_roles = result['annotations'].map { |item| item['role'] }

    assert_includes roles, 'pipe_centerline'
    assert_includes roles, 'flow_direction'
    assert_includes annotation_roles, 'pipe_size'
    assert_includes annotation_roles, 'slope'
    assert_includes annotation_roles, 'invert_start'
    assert_includes annotation_roles, 'invert_end'
    assert_equal 'plumbing_drainage_plan', result['metadata']['drawing_family']
    assert_equal 'semi_auto', result['metadata']['route_strategy']
  end

  def test_unknown_pipe_invert_is_explicitly_marked_for_verification
    definition = JiraNot::ConstructFlow::Drainage::PipeRouteDefinition.new(
      system: 'rainwater',
      route_nodes_mm: [[0, 0, 0], [3000, 0, 0]],
      start_connector_id: 'dp-1',
      end_connector_id: 'mh-1',
      diameter_mm: 100
    )
    provider = JiraNot::ConstructFlow::Drainage::PlanRepresentationProvider.new(
      repository: FakeRepository.new(pipe_route: definition)
    )
    object = FakeObject.new('pipe-rw-1', 'drainage.pipe_route', Object.new)

    payload = provider.render(
      object: object,
      request: { 'view' => 'rainwater_plan', 'scale' => '1:50', 'phase_view' => 'proposed', 'lod' => 'construction' }
    )
    slope = payload[:annotations].find { |item| item['role'] == 'slope_unknown' }

    refute_nil slope
    assert_equal 'verify', slope['status']
    assert_equal false, payload[:metadata]['invert_known']
  end

  def test_manhole_plan_contains_outline_symbol_and_level_annotations
    definition = JiraNot::ConstructFlow::Drainage::ManholeDefinition.new(
      location_mm: [5000, 2000, 100],
      size_mm: [600, 600],
      cover_level_mm: 100,
      invert_in_mm: -700,
      invert_out_mm: -750,
      manhole_type: 'inspection'
    )
    provider = JiraNot::ConstructFlow::Drainage::PlanRepresentationProvider.new(
      repository: FakeRepository.new(manhole: definition)
    )
    object = FakeObject.new('mh-1', 'drainage.manhole', Object.new)

    payload = provider.render(
      object: object,
      request: { 'view' => 'plumbing_plan', 'scale' => '1:50', 'phase_view' => 'proposed', 'lod' => 'construction' }
    )

    roles = payload[:primitives].map { |item| item['role'] }
    annotation_roles = payload[:annotations].map { |item| item['role'] }

    assert_includes roles, 'manhole_outline'
    assert_includes roles, 'manhole_symbol'
    assert_includes annotation_roles, 'object_tag'
    assert_includes annotation_roles, 'cover_level'
    assert_includes annotation_roles, 'invert_in'
    assert_includes annotation_roles, 'invert_out'
    assert_includes annotation_roles, 'depth'
  end
end
