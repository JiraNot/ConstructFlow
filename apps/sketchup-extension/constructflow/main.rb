# frozen_string_literal: true

require 'sketchup.rb'

require_relative 'core/module_registry'
require_relative 'core/event_bus'
require_relative 'core/command_bus'
require_relative 'core/phase'
require_relative 'core/level_registry'
require_relative 'core/attribute_store'

module JiraNot
  module ConstructFlow
    module Runtime
      class << self
        attr_reader :modules, :events, :commands, :levels

        def boot!
          return if @booted

          @modules = Core::ModuleRegistry.new
          @events = Core::EventBus.new
          @commands = Core::CommandBus.new(event_bus: @events)
          @levels = Core::LevelRegistry.new

          install_ui_entry
          @booted = true
        end

        def booted?
          !!@booted
        end

        private

        def install_ui_entry
          menu = UI.menu('Extensions')
          menu.add_item('ConstructFlow') do
            UI.messagebox(
              "ConstructFlow foundation loaded.\n\n" \
              "Module registry: #{@modules.size}\n" \
              "Level registry: #{@levels.size}\n" \
              "This build is an architecture foundation, not a production release."
            )
          end
        end
      end
    end

    Runtime.boot!
  end
end
