# frozen_string_literal: true

require_relative '../test_helper'

class RepresentationObjectResolverTest < Minitest::Test
  Resolver = JiraNot::ConstructFlow::Core::RepresentationObjectResolver

  SmartObjects = Struct.new(:direct, :source) do
    def fetch(entity)
      direct[entity]
    end

    def fetch_by_id(id)
      source[id.to_s]
    end
  end

  Runtime = Struct.new(:smart_objects)

  def test_resolves_rendered_plan_entity_to_source_smart_object
    source_object = Object.new
    rendered = FakeAttributeCarrier.new
    rendered.set_attribute('constructflow.representation', 'source_object_id', 'wall-1')
    runtime = Runtime.new(SmartObjects.new({}, { 'wall-1' => source_object }))

    assert_same source_object, Resolver.resolve(runtime, rendered)
  end

  def test_prefers_direct_smart_object_entity
    source_object = Object.new
    runtime = Runtime.new(SmartObjects.new({ source_object => source_object }, {}))

    assert_same source_object, Resolver.resolve(runtime, source_object)
  end
end
