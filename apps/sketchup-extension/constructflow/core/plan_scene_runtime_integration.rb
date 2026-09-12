# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module PlanSceneRuntimeIntegration
        module_function

        def install(runtime)
          singleton = class << runtime; self; end
          unless singleton.method_defined?(:plan_scenes)
            singleton.send(:define_method, :plan_scenes) do
              @plan_scenes ||= Core::SketchupPlanSceneService.new(runtime: self)
            end
          end

          install_geometry_refresh_subscription(runtime)
          install_menu(runtime)
        end

        def install_geometry_refresh_subscription(runtime)
          return unless runtime.respond_to?(:events)
          return if runtime.instance_variable_defined?(:@plan_scene_geometry_subscription)

          runtime.events.subscribe('GeometryChanged', owner: 'constructflow.core.plan_scene') do |_event|
            next unless runtime.respond_to?(:plan_scenes)

            runtime.plan_scenes.refresh_preset('architecture.construction')
          rescue StandardError => error
            runtime.diagnostics&.warn('plan_scene_refresh_failed', error.message)
          end
          runtime.instance_variable_set(:@plan_scene_geometry_subscription, true)
        end

        def install_menu(runtime)
          menu = runtime.respond_to?(:menu) ? runtime.menu : nil
          return unless menu && menu.respond_to?(:add_item)
          return if runtime.instance_variable_defined?(:@plan_scene_menu_installed)

          menu.add_item('Refresh Plumbing Plan') do
            result = runtime.plan_scenes.refresh
            if defined?(UI) && UI.respond_to?(:messagebox)
              UI.messagebox("ConstructFlow Plumbing Plan refreshed: #{result['rendered_count']} objects")
            end
          rescue StandardError => error
            if defined?(UI) && UI.respond_to?(:messagebox)
              UI.messagebox("ConstructFlow Plumbing Plan failed: #{error.message}")
            end
            raise
          end
          runtime.instance_variable_set(:@plan_scene_menu_installed, true)
        end
      end
    end
  end
end
