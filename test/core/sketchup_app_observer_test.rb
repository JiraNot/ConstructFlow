# frozen_string_literal: true

require 'minitest/autorun'

module Sketchup
  class AppObserver
  end unless const_defined?(:AppObserver)
end

module UI
  class << self
    attr_accessor :scheduled_callbacks

    def start_timer(_delay, _repeat, &callback)
      self.scheduled_callbacks ||= []
      scheduled_callbacks << callback
    end
  end
end unless defined?(UI)

require File.join(__dir__, '../../apps/sketchup-extension/constructflow/core/sketchup_app_observer')

class SketchupAppObserverTest < Minitest::Test
  Observer = JiraNot::ConstructFlow::Core::SketchupAppObserver

  def setup
    UI.scheduled_callbacks = [] if UI.respond_to?(:scheduled_callbacks=)
  end

  def test_new_model_callback_is_deferred_until_sketchup_finishes_model_setup
    models = []
    observer = Observer.new { |model| models << model }
    model = Object.new

    observer.onNewModel(model)

    assert_empty models
    assert_equal 1, UI.scheduled_callbacks.length
    UI.scheduled_callbacks.shift.call
    assert_equal [model], models
  end

  def test_open_model_uses_the_same_deferred_callback_boundary
    models = []
    observer = Observer.new { |model| models << model }
    model = Object.new

    observer.onOpenModel(model)

    assert_empty models
    UI.scheduled_callbacks.shift.call
    assert_equal [model], models
  end
end
