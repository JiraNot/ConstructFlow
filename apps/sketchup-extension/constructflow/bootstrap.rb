# frozen_string_literal: true

require_relative 'main'
require_relative 'core/entity_guard'
require_relative 'core/geometry_guard'
require_relative 'core/representation_registry'
require_relative 'core/representation_runtime_integration'
require_relative 'core/drawing_view_preset_registry'
require_relative 'core/drawing_view_preset_registration'
require_relative 'core/drawing_view_preset_runtime_integration'
require_relative 'core/plan_graphic_style_registry'
require_relative 'core/plan_graphic_style_registration'
require_relative 'core/plan_graphic_style_runtime_integration'
require_relative 'core/sketchup_native_graphic_style_adapter'
require_relative 'core/sketchup_plan_renderer'
require_relative 'core/sketchup_scene_presentation_service'
require_relative 'core/sketchup_plan_scene_service'
require_relative 'core/plan_scene_runtime_integration'
require_relative 'core/drawing_sheet_spec'
require_relative 'core/drawing_sheet_metadata'
require_relative 'core/vector_lineweight_profile'
require_relative 'core/layout_template_placeholder_map'
require_relative 'core/layout_template_registry'
require_relative 'core/layout_template_pin_store'
require_relative 'core/layout_template_asset_verifier'
require_relative 'core/layout_template_runtime_integration'
require_relative 'core/layout_export_plan_builder'
require_relative 'core/layout_export_runtime_integration'
require_relative 'core/drawing_issue_set'
require_relative 'core/drawing_issue_set_builder'
require_relative 'core/native_layout_sheet_decorator'
require_relative 'core/native_layout_adapter'
require_relative 'core/native_layout_issue_set_backend'
require_relative 'core/native_layout_issue_set_adapter'
require_relative 'core/native_layout_issue_set_service'
require_relative 'core/native_layout_export_service'
require_relative 'core/native_layout_runtime_integration'
require_relative 'modules/extension/execution_runner'
require_relative 'modules/structure/extension_command_registration'
require_relative 'modules/structure/plan_representation_provider'
require_relative 'modules/structure/representation_registration'
require_relative 'modules/roof/plan_representation_provider'
require_relative 'modules/roof/representation_registration'
require_relative 'modules/surface/plan_representation_provider'
require_relative 'modules/surface/representation_registration'
require_relative 'modules/interior/plan_representation_provider'
require_relative 'modules/interior/representation_registration'
require_relative 'modules/architecture/plan_representation_provider'
require_relative 'modules/architecture/representation_registration'
require_relative 'modules/opening/plan_representation_provider'
require_relative 'modules/opening/representation_registration'
require_relative 'modules/door_window/plan_representation_provider'
require_relative 'modules/door_window/representation_registration'
require_relative 'modules/electrical/device_definition'
require_relative 'modules/electrical/circuit_definition'
require_relative 'modules/electrical/repository'
require_relative 'modules/electrical/geometry'
require_relative 'modules/electrical/registration'
require_relative 'modules/electrical/plan_representation_provider'
require_relative 'modules/electrical/representation_registration'
require_relative 'modules/extension/runtime_integration'
require_relative 'modules/drainage/route_planner'
require_relative 'modules/drainage/route_candidate_evaluator'
require_relative 'modules/drainage/route_alternative_planner'
require_relative 'modules/drainage/route_edit_service'
require_relative 'modules/drainage/intermediate_manhole_planner'
require_relative 'modules/drainage/intermediate_manhole_service'
require_relative 'modules/drainage/route_detour_planner'
require_relative 'modules/drainage/route_detour_registration'
require_relative 'modules/drainage/network_audit'
require_relative 'modules/drainage/quantity/project_takeoff'
require_relative 'modules/drainage/quality_registration'
require_relative 'modules/drainage/routing_registration'
require_relative 'modules/drainage/plan_representation_provider'
require_relative 'modules/drainage/representation_registration'

JiraNot::ConstructFlow::Core::RepresentationRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::DrawingViewPresetRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::PlanGraphicStyleRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::PlanSceneRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::LayoutTemplateRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::LayoutExportRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::DrawingIssueSetRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::NativeLayoutRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::NativeLayoutIssueSetRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Electrical::Registration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Structure::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Roof::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Surface::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Interior::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Architecture::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Opening::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::DoorWindow::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Electrical::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Drainage::RoutingRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Drainage::RouteDetourRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Drainage::QualityRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Drainage::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Extension::RuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
