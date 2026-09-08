# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class SketchupAppObserver < Sketchup::AppObserver
        def initialize(&callback)
          @callback = callback
        end

        def onNewModel(model)
          @callback&.call(model)
        end

        def onOpenModel(model)
          @callback&.call(model)
        end
      end
    end
  end
end
