# frozen_string_literal: true

require_relative '../test_helper'

class ArchitectureDocumentationRepresentationProviderTest < Minitest::Test
  Architecture = JiraNot::ConstructFlow::Architecture

  def setup
    @entity = FakeEntity.new
    @object = Struct.new(:id, :type, :entity).new('wall-1', 'architecture.wall', @entity)
    Architecture::WallRepository.new.write(
      @entity,
      Architecture::WallDefinition.new(path_mm: [[0, 0, 100], [3000, 0, 100]], thickness_mm: 200, height_mm: 2800)
    )
    @provider = Architecture::DocumentationRepresentationProvider.new
  end

  def test_renders_wall_elevation_from_source_definition
    result = @provider.render(object: @object, request: { 'kind' => 'elevation', 'scale' => 50 })

    primitive = result[:primitives].first
    assert_equal 'closed_polyline', primitive['type']
    assert_equal [[0.0, 0.0, 100.0], [3000.0, 0.0, 100.0], [3000.0, 0.0, 2900.0], [0.0, 0.0, 2900.0], [0.0, 0.0, 100.0]], primitive['points_mm']
    assert_equal 'architecture_documentation', result[:metadata]['drawing_family']
    annotation = result[:annotations].first
    assert_equal 'wall-1', annotation['source_object_id']
    assert_equal 'elevation_start', annotation['anchor_key']
  end

  def test_renders_wall_section_with_thickness_and_height
    result = @provider.render(object: @object, request: { 'kind' => 'section' })

    points = result[:primitives].first['points_mm']
    assert_equal [-100.0, 0.0, 100.0], points.first
    assert_equal [100.0, 0.0, 2900.0], points[2]
    assert_equal 'section', result[:metadata]['projection']
    assert_equal 'wall-1', result[:annotations].first['source_object_id']
    assert_equal 'section_center', result[:annotations].first['anchor_key']
  end
end
