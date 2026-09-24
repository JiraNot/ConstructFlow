# frozen_string_literal: true

# Minimal SketchUp API stub for the test suite.
# Loaded when tests require the real bootstrap (which does `require 'sketchup.rb'`).
# Test files may extend this stub with their own fakes; they already guard
# additions with `unless const_defined?` / `respond_to?`, so keep this stub
# minimal and additive-only.

module Sketchup
  class AppObserver; end
  class EntitiesObserver; end
  class ModelObserver; end

  class << self
    attr_accessor :active_model

    def add_observer(_observer)
      true
    end
  end
end

module UI
  class StubMenu
    def add_submenu(_name)
      StubMenu.new
    end

    def add_item(_name = nil, &_block)
      nil
    end

    def add_separator
      nil
    end
  end

  class << self
    def menu(_name)
      @menu ||= StubMenu.new
    end
  end
end
