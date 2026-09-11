# frozen_string_literal: true

require_relative '../test_helper'

class DrainageDomainTest < Minitest::Test
  SmartObjectStub = Struct.new(:id, :created_phase, :removed_phase, :source_state, keyword_init: true)

  def test_manhole_depth_and_repository_round_trip
    definition = JiraNot::ConstructFlow::Drainage::ManholeDefinition.new(
      location_mm: [1000, 2000, 0],
      size_mm: [600, 600],
      cover_level_mm: 100,
      invert_in_mm: -500,
      invert_out_mm: -550,
      manhole_type: 'inspection'
    )

    assert definition.valid?
    assert_in_delta 650.0, definition.depth_mm, 0.001

    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Drainage::Repository.new
    repository.write_manhole(entity, definition)
    restored = repository.read_manhole(entity)

    assert_equal definition.to_h, restored.to_h
  end

  def test_manhole_rejects_invert_above_cover
    definition = JiraNot::ConstructFlow::Drainage::ManholeDefinition.new(
      location_mm: [0, 0, 0],
      cover_level_mm: 0,
      invert_in_mm: 100
    )

    refute definition.valid?
    assert_includes definition.errors, 'manhole inlet invert cannot be above cover level'
  end

  def test_pipe_route_calculates_gravity_slope
    definition = JiraNot::ConstructFlow::Drainage::PipeRouteDefinition.new(
      system: 'waste',
      route_nodes_mm: [[0, 0, -300], [5000, 0, -400]],
      start_connector_id: 'conn_start',
      end_connector_id: 'conn_end',
      diameter_mm: 100,
      start_invert_mm: -300,
      end_invert_mm: -400
    )

    assert definition.valid?
    assert_in_delta 5000.0, definition.horizontal_length_mm, 0.001
    assert_in_delta 2.0, definition.slope_percent, 0.001

    issues = JiraNot::ConstructFlow::Drainage::Validators::DrainageValidator.new.validate_route(definition)
    assert_empty issues
  end

  def test_unknown_invert_stays_verify_on_site
    definition = JiraNot::ConstructFlow::Drainage::PipeRouteDefinition.new(
      system: 'waste',
      route_nodes_mm: [[0, 0, 0], [3000, 0, 0]],
      start_connector_id: 'conn_start',
      end_connector_id: 'conn_end'
    )

    issues = JiraNot::ConstructFlow::Drainage::Validators::DrainageValidator.new.validate_route(definition)
    issue = issues.find { |item| item[:rule_id] == 'drainage.route.invert_unknown' }

    refute_nil issue
    assert_equal 'warning', issue[:severity]
    assert_equal 'verify_on_site', issue[:state]
    assert_nil definition.slope_percent
  end

  def test_reverse_slope_is_error
    definition = JiraNot::ConstructFlow::Drainage::PipeRouteDefinition.new(
      system: 'waste',
      route_nodes_mm: [[0, 0, 0], [4000, 0, 0]],
      start_connector_id: 'conn_start',
      end_connector_id: 'conn_end',
      start_invert_mm: -500,
      end_invert_mm: -400
    )

    issues = JiraNot::ConstructFlow::Drainage::Validators::DrainageValidator.new.validate_route(definition)
    issue = issues.find { |item| item[:rule_id] == 'drainage.route.reverse_slope' }

    refute_nil issue
    assert_equal 'error', issue[:severity]
  end

  def test_vertical_downpipe_is_valid_without_horizontal_slope_semantics
    definition = JiraNot::ConstructFlow::Drainage::DownpipeDefinition.new(
      route_nodes_mm: [[1000, 2000, 3200], [1000, 2000, 0]],
      start_connector_id: 'gutter_outlet',
      end_connector_id: 'rainwater_target',
      diameter_mm: 100
    )

    assert definition.valid?
    assert_in_delta 3200.0, definition.length_mm, 0.001
    assert_in_delta 3200.0, definition.vertical_length_mm, 0.001
    assert_in_delta 0.0, definition.horizontal_length_mm, 0.001
  end

  def test_downpipe_repository_round_trip_and_rejects_zero_length_segment
    definition = JiraNot::ConstructFlow::Drainage::DownpipeDefinition.new(
      route_nodes_mm: [[0, 0, 3000], [0, 0, 0], [1000, 0, 0]],
      start_connector_id: 'gutter_outlet',
      end_connector_id: 'mh_in',
      material: 'pvc'
    )
    entity = FakeEntity.new
    repository = JiraNot::ConstructFlow::Drainage::Repository.new
    repository.write_downpipe(entity, definition)

    assert_equal definition.to_h, repository.read_downpipe(entity).to_h

    invalid = definition.with(route_nodes_mm: [[0, 0, 0], [0, 0, 0]])
    refute invalid.valid?
    assert_includes invalid.errors, 'downpipe route contains zero-length segment'
  end

  def test_quantity_provider_is_phase_aware_and_traceable
    definition = JiraNot::ConstructFlow::Drainage::PipeRouteDefinition.new(
      system: 'rainwater',
      route_nodes_mm: [[0, 0, 0], [2500, 0, 0]],
      start_connector_id: 'conn_start',
      end_connector_id: 'conn_end',
      diameter_mm: 100
    )
    smart_object = SmartObjectStub.new(
      id: 'cf_route_1',
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil,
      source_state: 'confirmed'
    )

    item = JiraNot::ConstructFlow::Drainage::Quantity::DrainageQuantityProvider.new
            .pipe_quantities(smart_object: smart_object, definition: definition).first

    assert_equal 'cf_route_1', item[:source_object_id]
    assert_equal 'constructflow.drainage', item[:source_module]
    assert_equal 'drainage.rainwater.pipe', item[:classification]
    assert_in_delta 2.5, item[:value], 0.001
    assert_equal 'm', item[:unit]
    assert_equal JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION, item[:phase_scope]
  end

  def test_downpipe_quantity_reports_total_vertical_and_horizontal_length
    definition = JiraNot::ConstructFlow::Drainage::DownpipeDefinition.new(
      route_nodes_mm: [[0, 0, 3000], [0, 0, 0], [1500, 0, 0]],
      start_connector_id: 'gutter_outlet',
      end_connector_id: 'mh_in',
      diameter_mm: 80
    )
    smart_object = SmartObjectStub.new(
      id: 'cf_downpipe_1',
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil,
      source_state: 'confirmed'
    )

    item = JiraNot::ConstructFlow::Drainage::Quantity::DrainageQuantityProvider.new
            .downpipe_quantities(smart_object: smart_object, definition: definition).first

    assert_equal 'drainage.rainwater.downpipe', item[:classification]
    assert_in_delta 4.5, item[:value], 0.001
    assert_in_delta 3.0, item[:breakdown][:vertical_length_m], 0.001
    assert_in_delta 1.5, item[:breakdown][:horizontal_length_m], 0.001
  end
end
