# frozen_string_literal: true

require_relative 'main'
require_relative 'core/entity_guard'
require_relative 'core/geometry_guard'
require_relative 'core/representation_registry'
require_relative 'core/representation_runtime_integration'
require_relative 'modules/extension/execution_runner'
require_relative 'modules/structure/extension_command_registration'
require_relative 'modules/extension/runtime_integration'
require_relative 'modules/drainage/plan_representation_provider'
require_relative 'modules/drainage/representation_registration'

JiraNot::ConstructFlow::Core::RepresentationRuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Drainage::RepresentationRegistration.install(JiraNot::ConstructFlow::Runtime)
JiraNot::ConstructFlow::Extension::RuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
