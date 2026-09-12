# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class SketchupAppObserver < Sketchup::AppObserver
        def initialize(&callback)
          @callback = callback
        end

        def onNewModel(model)
          defer(model)
        end

        def onOpenModel(model)
          defer(model)
        end

        private

        def defer(model)
          if defined?(UI) && UI.respond_to?(:start_timer)
            UI.start_timer(0, false) { @callback&.call(model) }
          else
            @callback&.call(model)
          end
        end
      end
    end
  end
end
