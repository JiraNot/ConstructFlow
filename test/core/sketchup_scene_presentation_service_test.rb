# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'sketchup_scene_presentation_service')

class PresentationTag
  attr_reader :name
  attr_accessor :visible

  def initialize(name, visible: true)
    @name = name
    @visible = visible
  end
end

class PresentationLayers
  include Enumerable

  def initialize(*tags)
    @tags = tags
  end

  def each(&block)
    @tags.each(&block)
  end
end

class PresentationModel
  attr_reader :layers

  def initialize(layers)
    @layers = layers
  end
end

class PresentationPage < FakeAttributeCarrier
  attr_reader :updates

  def initialize
    super
    @updates = 0
  end

  def update
    @updates += 1
  end
end

class SketchupScenePresentationServiceTest < Minitest::Test
  def test_isolates_active_constructflow_drawing_tag_and_preserves_user_tags
    simple = PresentationTag.new('CF-DRAWING-SIMPLE')
    construction = PresentationTag.new('CF-DRAWING-CONSTRUCTION')
    style = PresentationTag.new('CF-STYLE-RAINWATER-DASH-NORMAL', visible: false)
    user = PresentationTag.new('SITE-TREES', visible: false)
    model = PresentationModel.new(PresentationLayers.new(simple, construction, style, user))
    page = PresentationPage.new

    result = JiraNot::ConstructFlow::Core::SketchupScenePresentationService.new.apply(
      model: model,
      page: page,
      active_drawing_tag: 'CF-DRAWING-CONSTRUCTION'
    )

    assert_equal false, simple.visible
    assert_equal true, construction.visible
    assert_equal true, style.visible
    assert_equal false, user.visible
    assert_equal 'CF-DRAWING-CONSTRUCTION', result['active_drawing_tag']
    assert_equal 1, page.updates
    assert_equal 'CF-DRAWING-CONSTRUCTION', page.get_attribute('constructflow.scene_presentation', 'active_drawing_tag')
  end

  def test_returns_empty_managed_sets_when_model_has_no_layers
    result = JiraNot::ConstructFlow::Core::SketchupScenePresentationService.new.apply(
      model: Object.new,
      page: nil,
      active_drawing_tag: 'CF-DRAWING-SIMPLE'
    )

    assert_equal [], result['managed_drawing_tags']
    assert_equal [], result['managed_style_tags']
  end
end
