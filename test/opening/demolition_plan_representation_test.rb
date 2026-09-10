# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ARCH, 'wall_repository')
require File.join(OPENING, 'opening_repository')
require File.join(OPENING, 'plan_representation_provider')

class OpeningDemolitionPlanRepresentationTest < Minitest::Test
  ObjectRecord = Struct.new(:id, :type, :entity, :relationships, keyword_init: true)

  class Objects
    def initialize(values)
      @values = values
    end

    def fetch_by_id(id)
      @values.find { |object| object.id.to_s == id.to_s }
    end
  end

  def setup
    @wall_entity = FakeEntity.new
    @opening_entity = FakeEntity.new
    @wall = ObjectRecord.new(id: 'wall-existing', type: 'architecture.wall', entity: @wall_entity, relationships: [])
    @opening = ObjectRecord.new(
      id: 'opening-1',
      type: 'opening.rectangular',
      entity: @opening_entity,
      relationships: [{ 'kind' => 'host', 'target_id' => 'wall-existing', 'role' => 'modifies_existing_host' }]
    )
    JiraNot::ConstructFlow::Architecture::WallRepository.new.write(
      @wall_entity,
      JiraNot::ConstructFlow::Architecture::WallDefinition.new(
        path_mm: [[0, 0, 0], [4000, 0, 0]], height_mm: 2800
      )
    )
    JiraNot::ConstructFlow::Opening::OpeningRepository.new.write(
      @opening_entity,
      JiraNot::ConstructFlow::Opening::OpeningDefinition.new(
        host_object_id: 'wall-existing', segment_index: 0, start_offset_mm: 1200,
        width_mm: 900, height_mm: 2100, sill_mm: 0
      )
    )
    runtime = Struct.new(:smart_objects).new(Objects.new([@wall, @opening]))
    @provider = JiraNot::ConstructFlow::Opening::PlanRepresentationProvider.new(runtime: runtime)
  end

  def test_demolition_view_marks_opening_primitives_and_annotations_as_demolition_intent
    result = @provider.render(
      object: @opening,
      request: {
        'view' => 'Architecture Demolition',
        'scale' => '1:50',
        'phase_view' => 'demolition',
        'lod' => 'construction',
        'context' => { 'style_preset' => 'architecture.demolition' }
      }
    )

    assert result[:metadata]['demolition_cut']
    assert result[:primitives].all? { |item| item['lifecycle_role'] == 'demolition' }
    assert result[:annotations].all? { |item| item['lifecycle_role'] == 'demolition' }
  end

  def test_proposed_view_keeps_normal_new_work_lifecycle_styling
    result = @provider.render(
      object: @opening,
      request: {
        'view' => 'Architecture Construction',
        'scale' => '1:50',
        'phase_view' => 'proposed',
        'lod' => 'construction',
        'context' => { 'style_preset' => 'architecture.construction' }
      }
    )

    refute result[:metadata]['demolition_cut']
    assert result[:primitives].none? { |item| item.key?('lifecycle_role') }
  end
end
