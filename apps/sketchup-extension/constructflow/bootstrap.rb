# frozen_string_literal: true

# ConstructFlow extension bootstrap entrypoint.
# Initializes the core runtime, loads registered domain modules through
# the ModuleLoader in deterministic topological order, and loads the
# production real project generator.

require_relative 'main'
require_relative 'real_project_generator'
