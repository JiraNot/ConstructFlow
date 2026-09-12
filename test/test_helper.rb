# frozen_string_literal: true

require 'minitest/autorun'

ROOT = File.expand_path('..', __dir__)
CORE = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'core')

require File.join(CORE, 'id_generator')
require File.join(CORE, 'diagnostic_log')
require File.join(CORE, 'attribute_store')
require File.join(CORE, 'units')
require File.join(CORE, 'phase')
require File.join(CORE, 'project_store')
require File.join(CORE, 'level_registry')
require File.join(CORE, 'migration_registry')
require File.join(CORE, 'smart_object')
require File.join(CORE, 'smart_object_manager')
require File.join(CORE, 'transaction_manager')
require File.join(CORE, 'event_bus')
require File.join(CORE, 'command_bus')
require File.join(CORE, 'module_registry')
require File.join(CORE, 'module_loader')
require File.join(CORE, 'capability_registry')
require File.join(CORE, 'connector_registry')
require File.join(CORE, 'mep_semantic_contract')
require File.join(CORE, 'representation_object_resolver')
require File.join(CORE, 'plan_level_context')
require File.join(CORE, 'plan_selection_filter')
require File.join(CORE, 'parametric_object_engine')
require File.join(CORE, 'constraint_engine')
require File.join(CORE, 'schedule_editor')

ARCH = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'architecture')
require File.join(ARCH, 'wall_definition')
require File.join(ARCH, 'wall_repository')
require File.join(ARCH, 'wall_join_engine')
require File.join(ARCH, 'floor_definition')
require File.join(ARCH, 'floor_repository')
require File.join(ARCH, 'quantity', 'floor_quantity_provider')
require File.join(ARCH, 'room_definition')
require File.join(ARCH, 'room_repository')
require File.join(ARCH, 'room_enclosure_detector')
require File.join(ARCH, 'plan_reference_collector')
require File.join(ARCH, 'documentation_representation_provider')
require File.join(ARCH, 'quantity', 'room_quantity_provider')
require File.join(ARCH, 'ceiling_definition')
require File.join(ARCH, 'ceiling_repository')
require File.join(ARCH, 'quantity', 'ceiling_quantity_provider')
require File.join(ARCH, 'validators', 'wall_validator')
require File.join(ARCH, 'quantity', 'wall_quantity_provider')
require File.join(ARCH, 'wall_host_capability')

OPENING = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'opening')
require File.join(OPENING, 'opening_definition')
require File.join(OPENING, 'opening_repository')
require File.join(OPENING, 'validators', 'opening_validator')
require File.join(OPENING, 'quantity', 'opening_quantity_provider')
require File.join(OPENING, 'opening_infill_host_capability')

DOOR_WINDOW = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'door_window')
require File.join(DOOR_WINDOW, 'door_window_type')
require File.join(DOOR_WINDOW, 'type_registry')
require File.join(DOOR_WINDOW, 'instance_definition')
require File.join(DOOR_WINDOW, 'instance_repository')
require File.join(DOOR_WINDOW, 'validators', 'door_window_validator')
require File.join(DOOR_WINDOW, 'quantity', 'door_window_quantity_provider')

DRAINAGE = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'drainage')
require File.join(DRAINAGE, 'manhole_definition')
require File.join(DRAINAGE, 'pipe_route_definition')
require File.join(DRAINAGE, 'downpipe_definition')
require File.join(DRAINAGE, 'repository')
require File.join(DRAINAGE, 'validators', 'drainage_validator')
require File.join(DRAINAGE, 'quantity', 'drainage_quantity_provider')

EXTENSION = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'extension')
require File.join(EXTENSION, 'extension_definition')
require File.join(EXTENSION, 'repository')
require File.join(EXTENSION, 'boundary_capability')
require File.join(EXTENSION, 'validators', 'extension_validator')
require File.join(EXTENSION, 'quantity', 'extension_quantity_provider')

ROOF = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'roof')
require File.join(ROOF, 'roof_definition')
require File.join(ROOF, 'gutter_definition')
require File.join(ROOF, 'repository')
require File.join(ROOF, 'edge_host_capability')
require File.join(ROOF, 'validators', 'roof_validator')
require File.join(ROOF, 'quantity', 'roof_quantity_provider')

STRUCTURE = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'structure')
require File.join(STRUCTURE, 'column_definition')
require File.join(STRUCTURE, 'grid_definition')
require File.join(STRUCTURE, 'beam_definition')
require File.join(STRUCTURE, 'foundation_definition')
require File.join(STRUCTURE, 'rebar_set_definition')
require File.join(STRUCTURE, 'repository')
require File.join(STRUCTURE, 'grid_geometry')
require File.join(STRUCTURE, 'beam_geometry')
require File.join(STRUCTURE, 'coordination_capability')
require File.join(STRUCTURE, 'validators', 'structure_validator')
require File.join(STRUCTURE, 'quantity', 'structure_quantity_provider')
require File.join(STRUCTURE, 'registration')

SURFACE = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'surface')
require File.join(SURFACE, 'surface_definition')
require File.join(SURFACE, 'pattern_definition')
require File.join(SURFACE, 'paving_layout_definition')
require File.join(SURFACE, 'layout_solver')
require File.join(SURFACE, 'border_definition')
require File.join(SURFACE, 'parking_layout_definition')
require File.join(SURFACE, 'repository')
require File.join(SURFACE, 'validators', 'surface_validator')
require File.join(SURFACE, 'quantity', 'surface_quantity_provider')

class FakeAttributeCarrier
  def initialize
    @attributes = Hash.new { |hash, key| hash[key] = {} }
  end

  def get_attribute(dictionary, key, default = nil)
    @attributes[dictionary].fetch(key, default)
  end

  def set_attribute(dictionary, key, value)
    @attributes[dictionary][key] = value
    value
  end

  def delete_attribute(dictionary, key = nil)
    return @attributes.delete(dictionary) if key.nil?

    @attributes[dictionary].delete(key)
  end
end

class FakeEntity < FakeAttributeCarrier
  attr_reader :entities

  def initialize(children = [])
    super()
    @entities = children
  end
end

class FakeModel < FakeAttributeCarrier
  attr_reader :entities, :operations

  def initialize(entities = [])
    super()
    @entities = entities
    @operations = []
  end

  def start_operation(name, disable_ui = true, next_transparent = false, transparent = false)
    @operations << [:start, name, disable_ui, next_transparent, transparent]
    true
  end

  def commit_operation
    @operations << [:commit]
    true
  end

  def abort_operation
    @operations << [:abort]
    true
  end

  def undo
    true
  end

  def redo
    true
  end
end
