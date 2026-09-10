# frozen_string_literal: true

require_relative '../../test_helper'
require File.join(APP, 'modules', 'structure', 'plan_representation_provider')

class StructurePlanRepoFake
  attr_accessor :column, :foundation
  def read_column(_entity) = column
  def read_foundation(_entity) = foundation
end

class StructurePlanObjectFake
  attr_reader :id, :type, :entity
  def initialize(id:, type:)
    @id = id
    @type = type
    @entity = Object.new
  end
end

class StructureColumnFake
  attr_reader :location_mm, :section_mm, :material, :engineering_status
  def initialize
    @location_mm = [1000.0, 2000.0, 0.0]
    @section_mm = [200.0, 300.0]
    @material = 'reinforced_concrete'
    @engineering_status = 'preliminary'
  end
end

class StructureFoundationFake
  attr_reader :center_mm, :size_mm, :foundation_type, :engineering_status, :supported_object_id
  def initialize
    @center_mm = [1000.0, 2000.0, -100.0]
    @size_mm = [900.0, 1100.0, 300.0]
    @foundation_type = 'spread_footing'
    @engineering_status = 'engineer_approved'
    @supported_object_id = 'column-1'
  end
end

class StructurePlanRepresentationProviderTest < Minitest::Test
  def request(lod)
    {
      'view' => 'plan',
      'scale' => '1:50',
      'phase_view' => 'new_construction',
      'lod' => lod,
      'context' => { 'style_preset' => "structure.#{lod}" }
    }
  end

  def test_column_construction_plan_has_outline_symbol_and_section_annotation
    repo = StructurePlanRepoFake.new
    repo.column = StructureColumnFake.new
    provider = JiraNot::ConstructFlow::Structure::PlanRepresentationProvider.new(repository: repo)
    result = provider.render(
      object: StructurePlanObjectFake.new(id: 'column-1', type: 'structure.column'),
      request: request('construction')
    )

    outline = result[:primitives].find { |item| item['role'] == 'column_outline' }
    assert_equal 5, outline['points_mm'].length
    assert_equal 'structure_column', outline['style_role']
    assert result[:annotations].any? { |item| item['role'] == 'section_size' && item['text'] == '200x300' }
    assert_equal 'structure_plan', result.dig(:metadata, 'drawing_family')
  end

  def test_column_coordination_flags_preliminary_engineering_status_for_verification
    repo = StructurePlanRepoFake.new
    repo.column = StructureColumnFake.new
    provider = JiraNot::ConstructFlow::Structure::PlanRepresentationProvider.new(repository: repo)
    result = provider.render(
      object: StructurePlanObjectFake.new(id: 'column-1', type: 'structure.column'),
      request: request('coordination')
    )

    status = result[:annotations].find { |item| item['role'] == 'engineering_status' }
    assert_equal 'verify', status['status']
  end

  def test_foundation_coordination_plan_exposes_support_relationship_context
    repo = StructurePlanRepoFake.new
    repo.foundation = StructureFoundationFake.new
    provider = JiraNot::ConstructFlow::Structure::PlanRepresentationProvider.new(repository: repo)
    result = provider.render(
      object: StructurePlanObjectFake.new(id: 'foundation-1', type: 'structure.foundation'),
      request: request('coordination')
    )

    assert result[:primitives].any? { |item| item['role'] == 'foundation_outline' }
    assert result[:annotations].any? { |item| item['role'] == 'supported_object' && item['text'] == 'SUPPORTS column-1' }
    assert_equal 'engineer_approved', result.dig(:metadata, 'engineering_status')
  end
end
