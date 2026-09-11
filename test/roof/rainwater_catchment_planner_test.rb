# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_catchment_planner')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_planning_registration')

class RainwaterCatchmentPlannerTest < Minitest::Test
  RoofObject = Struct.new(:id, :entity, :owner_module, :type, keyword_init: true)

  class SmartObjects
    def initialize(object)
      @object = object
    end

    def fetch_by_id(id)
      @object if @object.id.to_s == id.to_s
    end

    def fetch(entity)
      @object if @object.entity.equal?(entity)
    end
  end

  class Commands
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

  def lean_to
    JiraNot::ConstructFlow::Roof::RoofDefinition.new(
      boundary_mm: [[0, 0, 3000], [6000, 0, 3000], [6000, 4000, 3000], [0, 4000, 3000]],
      roof_form: 'lean_to',
      slope_percent: 5,
      slope_direction_xy: [0, 1],
      low_elevation_mm: 3000,
      covering_system: 'metal_sheet'
    )
  end

  def flat_roof
    lean_to.with(roof_form: 'flat', slope_percent: 0)
  end

  def planner
    JiraNot::ConstructFlow::Roof::RainwaterCatchmentPlanner.new
  end

  def test_calculates_projection_flow_and_even_outlet_layout_on_unique_low_eave
    result = planner.plan(
      roof_definition: lean_to,
      design_rainfall_mm_per_hr: 150,
      runoff_coefficient: 1.0,
      outlet_capacity_lps: 0.6
    )

    assert_equal 'ready_for_review', result['status']
    assert_in_delta 24.0, result['catchment_area_m2'], 0.0001
    assert_in_delta 1.0, result['peak_flow_lps'], 0.0001
    assert_equal 2, result['required_outlet_count']
    assert_equal [0], result['low_eave_edge_indices']
    assert_equal 0, result['suggested_edge_index']
    assert_equal 'unique_low_eave', result['edge_selection_source']
    assert_in_delta 1.0 / 3.0, result['suggested_outlet_ratios'][0], 0.0001
    assert_in_delta 2.0 / 3.0, result['suggested_outlet_ratios'][1], 0.0001
  end

  def test_flat_roof_requires_explicit_edge_instead_of_guessing
    result = planner.plan(
      roof_definition: flat_roof,
      design_rainfall_mm_per_hr: 150,
      runoff_coefficient: 1.0,
      outlet_capacity_lps: 1.0
    )

    assert_equal 'needs_edge_selection', result['status']
    assert_nil result['suggested_edge_index']
    assert_empty result['suggested_outlet_ratios']
    assert_equal [0, 1, 2, 3], result['low_eave_edge_indices']
    assert result['warnings'].any? { |warning| warning.include?('select an edge explicitly') }
  end

  def test_explicit_edge_is_respected_but_non_low_edge_is_flagged_for_review
    result = planner.plan(
      roof_definition: lean_to,
      design_rainfall_mm_per_hr: 150,
      runoff_coefficient: 0.9,
      outlet_capacity_lps: 2.0,
      edge_index: 2
    )

    assert_equal 2, result['suggested_edge_index']
    assert_equal 'explicit', result['edge_selection_source']
    assert result['warnings'].any? { |warning| warning.include?('not one of the resolved low-eave edges') }
  end

  def test_rejects_missing_or_non_engineering_inputs_instead_of_inventing_them
    assert_raises(ArgumentError) do
      planner.plan(
        roof_definition: lean_to,
        design_rainfall_mm_per_hr: nil,
        runoff_coefficient: 1.0,
        outlet_capacity_lps: 1.0
      )
    end
    assert_raises(ArgumentError) do
      planner.plan(
        roof_definition: lean_to,
        design_rainfall_mm_per_hr: 150,
        runoff_coefficient: 1.1,
        outlet_capacity_lps: 1.0
      )
    end
    assert_raises(ArgumentError) do
      planner.plan(
        roof_definition: lean_to,
        design_rainfall_mm_per_hr: 150,
        runoff_coefficient: 1.0,
        outlet_capacity_lps: 0
      )
    end
  end

  def test_public_command_is_non_mutating_and_returns_plan_as_event_evidence
    entity = FakeEntity.new
    JiraNot::ConstructFlow::Roof::Repository.new.write_roof(entity, lean_to)
    object = RoofObject.new(
      id: 'roof-1', entity: entity,
      owner_module: 'constructflow.roof', type: 'roof.system'
    )
    commands = Commands.new
    runtime = Struct.new(:commands, :smart_objects).new(commands, SmartObjects.new(object))
    JiraNot::ConstructFlow::Roof::RainwaterPlanningRegistration.install(runtime)

    result = commands.execute(
      'PlanRoofRainwaterCatchment',
      {
        roof_object_id: 'roof-1',
        design_rainfall_mm_per_hr: 150,
        runoff_coefficient: 1.0,
        outlet_capacity_lps: 0.6
      }
    )

    assert_equal 'success', result[:status]
    assert_nil result[:created_object_ids]
    event = result[:events].first
    assert_equal 'RoofRainwaterCatchmentPlanned', event[:name]
    assert_equal ['roof-1'], event[:object_ids]
    assert_equal 'roof-1', event[:payload]['roof_object_id']
    assert_equal 2, event[:payload]['required_outlet_count']
  end
end
