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
require_relative 'core/layout_export_plan_builder'
require_relative 'core/layout_export_runtime_integration'
require_relative 'core/layout_template_registry'
require_relative 'core/layout_template_runtime_integration'
require_relative 'core/native_layout_sheet_decorator'
require_relative 'core/native_layout_template_placeholder_mapper'
require_relative 'core/native_layout_adapter'
require_relative 'core/native_layout_export_service'
require_relative 'core/native_layout_runtime_integration'
require_relative 'modules/extension/execution_runner'
require_relative 'modules/structure/extension_command_registration'
require_relative 'modules/extension/runtime_integration'
require_relative 'modules/drainage/plan_representation_provider'
require_relative 'modules/drainage/representation_registration'

JiraNot::ConstructFlow::Core::RepresentationRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::DrawingViewPresetRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::PlanGraphicStyleRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::PlanSceneRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::LayoutExportRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::LayoutTemplateRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Core::NativeLayoutRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Drainage::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Extension::RuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
