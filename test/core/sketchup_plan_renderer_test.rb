# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'representation_registry')
require File.join(CORE, 'sketchup_plan_renderer')
require File.join(CORE, 'sketchup_plan_scene_service')

class FakeDrawingEntity < FakeAttributeCarrier
  attr_accessor :layer, :name
end

class FakeDrawingEntities
  include Enumerable

  attr_reader :items

  def initialize
    @items = []
  end

  def each(&block)
    @items.each(&block)
  end

  def add_line(from, to)
    entity = FakeDrawingEntity.new
    entity.set_attribute('test', 'kind', 'line')
    entity.set_attribute('test', 'from', from)
    entity.set_attribute('test', 'to', to)
    @items << entity
    entity
  end

  def add_text(text, point)
    entity = FakeDrawingEntity.new
    entity.set_attribute('test', 'kind', 'text')
    entity.set_attribute('test', 'text', text)
    entity.set_attribute('test', 'point', point)
    @items << entity
    entity
  end

  def add_group
    group = FakeDrawingGroup.new
    @items << group
    group
  end

  def clear!
    @items.clear
  end
end

class FakeDrawingGroup < FakeDrawingEntity
  attr_reader :entities

  def initialize
    super
    @entities = FakeDrawingEntities.new
  end
end

class FakePages
  attr_reader :pages

  def initialize
    @pages = {}
  end

  def [](name)
    @pages[name]
  end

  def add(name)
    @pages[name] = FakePage.new(name)
  end
end

class FakePage
  attr_reader :name, :updates

  def initialize(name)
    @name = name
    @updates = 0
  end

  def update
    @updates += 1
  end
end

class FakeLayers
  def initialize
    @values = {}
  end

  def [](name)
    @values[name]
  end

  def add(name)
    @values[name] = name
  end
end

class FakeDrawingModel < FakeAttributeCarrier
  attr_reader :entities, :operations, :pages, :layers

  def initialize
    super()
    @entities = FakeDrawingEntities.new
    @operations = []
    @pages = FakePages.new
    @layers = FakeLayers.new
  end

  def start_operation(name, disable_ui = true, next_transparent = false, transparent = false)
    @operations << [:start, name, disable_ui, next_transparent, transparent]
    true
  end

  def commit_operation
    @operations << [:commit]
    true
  end

  def abort_operation
    @operations << [:abort]
    true
  end
end

class FakeRepresentationRuntime
  attr_reader :active_model, :representations, :smart_objects

  def initialize(model:, representations:, smart_objects:)
    @active_model = model
    @representations = representations
    @smart_objects = smart_objects
  end
end

class StaticPlanProvider
  def render(object:, request:)
    {
      primitives: [
        { 'type' => 'polyline', 'points_mm' => [[0, 0, 0], [2540, 0, 0]] },
        { 'type' => 'flow_arrow', 'from_mm' => [0, 0, 0], 'to_mm' => [2540, 0, 0] }
      ],
      annotations: [
        { 'type' => 'text', 'anchor_mm' => [1270, 0, 0], 'text' => 'Ø100' }
      ],
      metadata: request
    }
  end
end

class SketchupPlanRendererTest < Minitest::Test
  def test_renderer_converts_millimetres_and_marks_created_entities
    entities = FakeDrawingEntities.new
    renderer = JiraNot::ConstructFlow::Core::SketchupPlanRenderer.new
    representation = {
      'object_id' => 'pipe-1',
      'object_type' => 'drainage.pipe_route',
      'kind' => 'plan',
      'owner_module' => 'constructflow.drainage',
      'primitives' => [
        { 'type' => 'polyline', 'points_mm' => [[0, 0, 0], [2540, 0, 0]] },
        { 'type' => 'flow_arrow', 'from_mm' => [0, 0, 0], 'to_mm' => [2540, 0, 0] }
      ],
      'annotations' => [
        { 'type' => 'text', 'anchor_mm' => [1270, 0, 0], 'text' => 'Ø100' }
      ]
    }

    created = renderer.render(representation: representation, entities: entities)

    assert_operator created.length, :>=, 5
    first_line = entities.items.first
    assert_in_delta 100.0, first_line.get_attribute('test', 'to')[0], 0.0001
    assert_equal 'pipe-1', first_line.get_attribute('constructflow.representation', 'source_object_id')
    assert_equal 'plan', first_line.get_attribute('constructflow.representation', 'representation_kind')
    assert entities.items.any? { |item| item.get_attribute('test', 'text') == 'Ø100' }
  end

  def test_scene_refresh_is_idempotent_and_uses_registered_plan_providers
    model = FakeDrawingModel.new
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: model)
    source_entity = FakeDrawingGroup.new
    model.entities.items << source_entity
    object = manager.create(
      entity: source_entity,
      type: 'drainage.pipe_route',
      owner_module: 'constructflow.drainage'
    )

    registry = JiraNot::ConstructFlow::Core::RepresentationRegistry.new
    registry.register(
      object_type: 'drainage.pipe_route',
      kind: 'plan',
      owner_module: 'constructflow.drainage',
      provider: StaticPlanProvider.new
    )
    runtime = FakeRepresentationRuntime.new(model: model, representations: registry, smart_objects: manager)
    service = JiraNot::ConstructFlow::Core::SketchupPlanSceneService.new(runtime: runtime)

    first = service.refresh(scene_name: 'Plumbing Plan')
    output_group = first['group']
    first_count = output_group.entities.items.length
    second = service.refresh(scene_name: 'Plumbing Plan')

    assert_equal 1, first['rendered_count']
    assert_equal [object.id], second['rendered_object_ids']
    assert_same output_group, second['group']
    assert_equal first_count, output_group.entities.items.length
    assert_equal 1, model.entities.items.count { |entity| entity.get_attribute('constructflow.plan_scene', 'managed', false) }
    assert_equal :commit, model.operations.last.first
  end
end
