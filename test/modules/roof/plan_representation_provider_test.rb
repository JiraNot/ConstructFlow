# frozen_string_literal: true

require_relative '../../test_helper'
require File.join(APP, 'modules', 'roof', 'plan_representation_provider')

class RoofPlanRepoFake
  attr_accessor :roof
  def read_roof(_entity) = roof
end

class RoofPlanObjectFake
  attr_reader :id, :type, :entity
  def initialize
    @id = 'roof-1'
    @type = 'roof.system'
    @entity = Object.new
  end
end

class RoofDefinitionFake
  attr_reader :boundary_mm, :roof_form, :slope_percent, :slope_direction_xy,
              :covering_system, :generated_from_id

  def initialize
    @boundary_mm = [[0.0, 0.0, 3000.0], [6000.0, 0.0, 3000.0], [6000.0, 4000.0, 3000.0], [0.0, 4000.0, 3000.0]]
    @roof_form = 'lean_to'
    @slope_percent = 5.0
    @slope_direction_xy = [0.0, 1.0]
    @covering_system = 'metal_sheet'
    @generated_from_id = 'extension-1'
  end

  def plan_area_mm2 = 24_000_000.0
end

class RoofPlanRepresentationProviderTest < Minitest::Test
  def request(lod)
    {
      'view' => 'plan', 'scale' => '1:50', 'phase_view' => 'new_construction', 'lod' => lod,
      'context' => { 'style_preset' => "roof.#{lod}" }
    }
  end

  def provider
    repo = RoofPlanRepoFake.new
    repo.roof = RoofDefinitionFake.new
    JiraNot::ConstructFlow::Roof::PlanRepresentationProvider.new(repository: repo)
  end

  def test_simple_profile_has_boundary_without_slope_arrow
    result = provider.render(object: RoofPlanObjectFake.new, request: request('simple'))
    assert result[:primitives].any? { |item| item['role'] == 'roof_boundary' }
    refute result[:primitives].any? { |item| item['role'] == 'roof_slope_direction' }
    assert_equal 'roof_plan', result.dig(:metadata, 'drawing_family')
  end

  def test_construction_profile_adds_slope_and_covering
    result = provider.render(object: RoofPlanObjectFake.new, request: request('construction'))
    assert result[:primitives].any? { |item| item['role'] == 'roof_slope_direction' }
    assert result[:annotations].any? { |item| item['role'] == 'roof_slope' && item['text'] == 'S=5.0%' }
    assert result[:annotations].any? { |item| item['role'] == 'roof_covering' && item['text'] == 'METAL SHEET' }
  end

  def test_coordination_profile_preserves_generation_traceability
    result = provider.render(object: RoofPlanObjectFake.new, request: request('coordination'))
    assert result[:annotations].any? { |item| item['role'] == 'generated_from' && item['text'] == 'FROM extension-1' }
    assert_equal 'extension-1', result.dig(:metadata, 'generated_from_id')
  end
end
