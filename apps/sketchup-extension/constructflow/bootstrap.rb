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
require_relative 'core/native_acceptance_evidence_store'
require_relative 'core/native_acceptance_preflight'
require_relative 'core/native_acceptance_service'
require_relative 'core/native_acceptance_auto_evidence'
require_relative 'core/native_acceptance_runtime_integration'
require_relative 'core/native_copy_identity_repair'
require_relative 'core/sketchup_native_copy_identity_observer'
require_relative 'core/native_copy_identity_runtime_integration'
require_relative 'modules/extension/execution_runner'
require_relative 'modules/architecture/attachment_edge_resolver'
require_relative 'modules/architecture/extension_command_registration'
require_relative 'modules/opening/extension_command_registration'
require_relative 'modules/door_window/extension_command_registration'
require_relative 'modules/structure/extension_command_registration'
require_relative 'modules/surface/extension_command_registration'
require_relative 'modules/roof/extension_command_registration'
require_relative 'modules/interior/extension_command_registration'
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
require_relative 'modules/electrical/quantity/electrical_quantity_provider'
require_relative 'modules/electrical/registration'
require_relative 'modules/electrical/extension_command_registration'
require_relative 'modules/electrical/plan_representation_provider'
require_relative 'modules/electrical/representation_registration'
require_relative 'modules/extension/runtime_integration'
require_relative 'modules/drainage/downpipe_definition'
require_relative 'modules/drainage/rainwater_downpipe_service'
require_relative 'modules/drainage/rainwater_downpipe_registration'
require_relative 'modules/roof/rainwater_registration'
require_relative 'modules/roof/rainwater_catchment_planner'
require_relative 'modules/roof/rainwater_planning_registration'
require_relative 'modules/roof/rainwater_plan_application'
require_relative 'modules/roof/rainwater_package_integration'
require_relative 'modules/roof/hosted_gutter_regenerator'
require_relative 'modules/drainage/route_planner'
require_relative 'modules/drainage/extension_command_registration'
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
require_relative 'modules/drainage/tools/route_node_tool'
require_relative 'modules/drainage/route_node_picker'
require_relative 'modules/drainage/route_node_ui_registration'
require_relative 'modules/drainage/routing_registration'
require_relative 'modules/drainage/plan_representation_provider'
require_relative 'modules/drainage/representation_registration'
require_relative 'modules/extension/construction_intent_store'
require_relative 'modules/extension/construction_intent_registration'
require_relative 'modules/extension/construction_takeoff'
require_relative 'modules/extension/construction_quality_gate'
require_relative 'modules/extension/construction_issue_set_factory'
require_relative 'modules/extension/construction_currentness_audit'
require_relative 'modules/extension/construction_output_settlement'
require_relative 'modules/extension/construction_issue_history_store'
require_relative 'modules/extension/construction_workflow_runner'
require_relative 'modules/extension/construction_workflow_registration'

JiraNot::ConstructFlow::Core::RepresentationRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::DrawingViewPresetRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::PlanGraphicStyleRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::PlanSceneRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::LayoutTemplateRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::LayoutExportRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::DrawingIssueSetRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::NativeLayoutRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::NativeLayoutIssueSetRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::NativeAcceptanceRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::NativeCopyIdentityRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Electrical::Registration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Structure::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Roof::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Surface::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Interior::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Architecture::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Opening::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::DoorWindow::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Electrical::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Drainage::RainwaterDownpipeRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Roof::RainwaterRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Roof::RainwaterPlanningRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Roof::RainwaterPlanApplicationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Drainage::RoutingRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Drainage::RouteDetourRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Drainage::QualityRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Drainage::RouteNodeUiRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Drainage::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Extension::RuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Extension::ConstructionIntentRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Extension::ConstructionWorkflowRegistration.install(JiraNot::ConstructFlow::Runtime)