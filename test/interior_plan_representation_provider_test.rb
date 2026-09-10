# frozen_string_literal: true

require_relative 'test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/cabinet_run_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/plan_representation_provider')

InteriorPlanObject = Struct.new(:id, :type, :entity)

class InteriorPlanRepresentationProviderTest < Minitest::Test
  def setup
    @repository = JiraNot::ConstructFlow::Interior::Repository.new
  end

  def request(lod)
    {
      'view' => 'plan', 'scale' => '1:50', 'phase_view' => 'proposed', 'lod' => lod,
      'context' => { 'style_preset' => "interior.#{lod}" }
    }
  end

  def definition
    JiraNot::ConstructFlow::Interior::CabinetRunDefinition.new(
      origin_mm: [1000, 2000, 0], width_mm: 2400, height_mm: 850, depth_mm: 600,
      angle_deg: 90, mode: 'fabrication', host_object_id: 'wall-1',
      modules: [
        { 'id' => 'M01', 'width_mm' => 1200 },
        { 'id' => 'M02', 'width_mm' => 1200 }
      ]
    )
  end

  def test_construction_plan_contains_footprint_front_and_module_divider
    entity = FakeAttributeCarrier.new
    @repository.write_cabinet_run(entity, definition)
    object = InteriorPlanObject.new('cabinet-1', 'interior.cabinet_run', entity)
    provider = JiraNot::ConstructFlow::Interior::PlanRepresentationProvider.new(repository: @repository)

    result = provider.render(object: object, request: request('construction'))

    assert result[:primitives].any? { |item| item['role'] == 'cabinet_footprint' }
    assert result[:primitives].any? { |item| item['role'] == 'cabinet_front_line' }
    assert result[:primitives].any? { |item| item['role'] == 'cabinet_module_divider' }
    assert result[:annotations].any? { |item| item['role'] == 'cabinet_size' }
    assert_equal 2, result[:metadata]['module_count']
  end

  def test_coordination_plan_contains_height_material_and_host
    entity = FakeAttributeCarrier.new
    @repository.write_cabinet_run(entity, definition)
    object = InteriorPlanObject.new('cabinet-1', 'interior.cabinet_run', entity)
    provider = JiraNot::ConstructFlow::Interior::PlanRepresentationProvider.new(repository: @repository)

    result = provider.render(object: object, request: request('coordination'))

    assert result[:annotations].any? { |item| item['role'] == 'cabinet_height' }
    assert result[:annotations].any? { |item| item['role'] == 'material' }
    assert result[:annotations].any? { |item| item['role'] == 'host_object' }
    assert_equal 'interior_joinery_plan', result[:metadata]['drawing_family']
  end
end
