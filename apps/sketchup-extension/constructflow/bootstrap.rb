# frozen_string_literal: true

require_relative 'main'
require_relative 'core/entity_guard'
require_relative 'core/geometry_guard'
require_relative 'modules/extension/execution_runner'
require_relative 'modules/structure/extension_command_registration'
require_relative 'modules/roof/extension_command_registration'
require_relative 'modules/extension/runtime_integration'

JiraNot::ConstructFlow::Extension::RuntimeIntegration.install(JiraNot::ConstructFlow::Runtime)
