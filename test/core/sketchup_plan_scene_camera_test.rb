# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'sketchup_plan_scene_service')

# Plan scenes refresh on every GeometryChanged event, so they must author the
# managed scene's top parallel camera without stealing the user's live viewport.
unless defined?(Sketchup::Camera)
  module Sketchup
    class Camera
      attr_reader :eye, :target, :up

      def initialize(eye, target, up, perspective)
        @eye = eye
        @target = target
        @up = up
        @perspective = perspective
      end

      def perspective?
        @perspective
      end

      def height
        0.0
      end
    end
  end
end

class SketchupPlanSceneCameraTest < Minitest::Test
  FakeCamera = Struct.new(:eye, :target, :up, :perspective) do
    def perspective? = perspective
    def height = 0.0
  end

  class FakeView
    attr_reader :assignments

    def initialize(camera)
      @camera = camera
      @assignments = []
    end

    def camera = @camera

    def camera=(value)
      @camera = value
      @assignments << value
    end
  end

  class FakeBounds
    def initialize(center) = @center = center
    def center = @center
  end

  class FakeViewportModel
    attr_reader :active_view, :bounds

    def initialize(view:, bounds: nil)
      @active_view = view
      @bounds = bounds
    end
  end

  class FakePage
    attr_reader :updates

    def initialize
      @updates = 0
    end

    def update = @updates += 1
  end

  def service
    JiraNot::ConstructFlow::Core::SketchupPlanSceneService.allocate
  end

  def test_authors_top_parallel_camera_then_restores_the_user_view
    original = FakeCamera.new([10.0, 20.0, 30.0], [0.0, 0.0, 0.0], [0.0, 0.0, 1.0], true)
    view = FakeView.new(original)
    model = FakeViewportModel.new(view: view, bounds: FakeBounds.new([100.0, 200.0, 300.0]))
    page = FakePage.new

    service.send(:configure_top_parallel_view, model, page)

    assert_equal 1, page.updates, 'the scene page must capture the plan camera'
    assert_equal 2, view.assignments.length
    authored = view.assignments.first
    refute authored.equal?(original)
    refute authored.perspective?, 'the managed scene must record a parallel (top) camera'
    assert_in_delta 10_300.0, authored.eye[2], 0.0001
    assert_same original, view.camera, 'the user viewport must be left where the user had it'
    assert_same original, view.assignments.last
  end

  def test_leaves_the_user_view_untouched_when_there_is_no_scene_page
    original = FakeCamera.new([1.0, 2.0, 3.0], [0.0, 0.0, 0.0], [0.0, 0.0, 1.0], true)
    view = FakeView.new(original)
    model = FakeViewportModel.new(view: view, bounds: FakeBounds.new([0.0, 0.0, 0.0]))

    service.send(:configure_top_parallel_view, model, nil)

    assert_same original, view.camera
    assert_empty view.assignments
  end
end
