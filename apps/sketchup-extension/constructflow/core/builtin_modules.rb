# frozen_string_literal: true

require_relative 'module_definition'

module JiraNot
  module ConstructFlow
    module Core
      # Central registry and catalog of all built-in ConstructFlow domain modules
      # and platform runtime integrations.
      module BuiltinModules
        module_function

        def definitions
          [
            ModuleDefinition.new(
              manifest: Architecture::Registration::MANIFEST,
              installer: ->(runtime) { Architecture::Registration.install(runtime) },
              integrations: [
                ->(runtime) { Architecture::RepresentationRegistration.install(runtime) }
              ]
            ),
            ModuleDefinition.new(
              manifest: Opening::Registration::MANIFEST,
              installer: ->(runtime) { Opening::Registration.install(runtime) },
              integrations: [
                ->(runtime) { Opening::RepresentationRegistration.install(runtime) }
              ]
            ),
            ModuleDefinition.new(
              manifest: DoorWindow::Registration::MANIFEST,
              installer: ->(runtime) { DoorWindow::Registration.install(runtime) },
              integrations: [
                ->(runtime) { DoorWindow::RepresentationRegistration.install(runtime) }
              ]
            ),
            ModuleDefinition.new(
              manifest: Structure::Registration::MANIFEST,
              installer: ->(runtime) { Structure::Registration.install(runtime) },
              integrations: [
                ->(runtime) { Structure::RepresentationRegistration.install(runtime) }
              ]
            ),
            ModuleDefinition.new(
              manifest: Roof::Registration::MANIFEST,
              installer: ->(runtime) { Roof::Registration.install(runtime) },
              integrations: [
                ->(runtime) { Roof::RepresentationRegistration.install(runtime) },
                ->(runtime) { Roof::RainwaterRegistration.install(runtime) },
                ->(runtime) { Roof::RainwaterPlanningRegistration.install(runtime) },
                ->(runtime) { Roof::RainwaterPlanApplicationRegistration.install(runtime) }
              ]
            ),
            ModuleDefinition.new(
              manifest: Surface::Registration::MANIFEST,
              installer: ->(runtime) { Surface::Registration.install(runtime) },
              integrations: [
                ->(runtime) { Surface::LayoutRegistration.install(runtime) },
                ->(runtime) { Surface::RepresentationRegistration.install(runtime) }
              ]
            ),
            ModuleDefinition.new(
              manifest: Interior::Registration::MANIFEST,
              installer: ->(runtime) { Interior::Registration.install(runtime) },
              integrations: [
                ->(runtime) { Interior::RepresentationRegistration.install(runtime) }
              ]
            ),
            ModuleDefinition.new(
              manifest: Library::Registration::MANIFEST,
              installer: ->(runtime) { Library::Registration.install(runtime) },
              integrations: []
            ),
            ModuleDefinition.new(
              manifest: Drainage::Registration::MANIFEST,
              installer: ->(runtime) { Drainage::Registration.install(runtime) },
              integrations: [
                ->(runtime) { Drainage::RainwaterDownpipeRegistration.install(runtime) },
                ->(runtime) { Drainage::RoutingRegistration.install(runtime) },
                ->(runtime) { Drainage::RouteDetourRegistration.install(runtime) },
                ->(runtime) { Drainage::QualityRegistration.install(runtime) },
                ->(runtime) { Drainage::RouteNodeUiRegistration.install(runtime) },
                ->(runtime) { Drainage::RepresentationRegistration.install(runtime) }
              ]
            ),
            ModuleDefinition.new(
              manifest: Electrical::Registration::MANIFEST,
              installer: ->(runtime) { Electrical::Registration.install(runtime) },
              integrations: [
                ->(runtime) { Electrical::RepresentationRegistration.install(runtime) }
              ]
            ),
            ModuleDefinition.new(
              manifest: Extension::Registration::MANIFEST,
              installer: ->(runtime) { Extension::Registration.install(runtime) },
              integrations: [
                ->(runtime) { Extension::RuntimeIntegration.install(runtime) },
                ->(runtime) { Extension::ConstructionIntentRegistration.install(runtime) }
              ]
            ),
            ModuleDefinition.new(
              manifest: Costing::Registration::MANIFEST,
              installer: ->(runtime) { Costing::Registration.install(runtime) },
              integrations: []
            )
          ].freeze
        end

        def install_core_integrations(runtime)
          RepresentationRuntimeIntegration.install(runtime)
          DrawingViewPresetRuntimeIntegration.install(runtime)
          PlanGraphicStyleRuntimeIntegration.install(runtime)
          PlanSceneRuntimeIntegration.install(runtime)
          LayoutTemplateRuntimeIntegration.install(runtime)
          LayoutExportRuntimeIntegration.install(runtime)
          DrawingIssueSetRuntimeIntegration.install(runtime)
          NativeLayoutRuntimeIntegration.install(runtime)
          NativeLayoutIssueSetRuntimeIntegration.install(runtime)
          NativeAcceptanceRuntimeIntegration.install(runtime)
          NativeCopyIdentityRuntimeIntegration.install(runtime)
        end
      end
    end
  end
end
