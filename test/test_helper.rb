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
require File.join(CORE, 'i18n')
require File.join(CORE, 'ghost_preview')
require File.join(CORE, 'toolbar')

ARCH = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'architecture')
require File.join(ARCH, 'wall_definition')
require File.join(ARCH, 'wall_repository')
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
require File.join(DRAINAGE, 'fixture_connector_definition')
require File.join(DRAINAGE, 'fixture_connector_registry')
require File.join(DRAINAGE, 'auto_route_solver')
require File.join(DRAINAGE, 'geometry')
require File.join(DRAINAGE, 'repository')
require File.join(DRAINAGE, 'validators', 'drainage_validator')
require File.join(DRAINAGE, 'quantity', 'drainage_quantity_provider')
require File.join(DRAINAGE, 'route_planner')
require File.join(DRAINAGE, 'route_candidate_evaluator')
require File.join(DRAINAGE, 'route_alternative_planner')
require File.join(DRAINAGE, 'route_edit_service')
require File.join(DRAINAGE, 'intermediate_manhole_planner')
require File.join(DRAINAGE, 'intermediate_manhole_service')
require File.join(DRAINAGE, 'routing_registration')
require File.join(DRAINAGE, 'rainwater_downpipe_service')
require File.join(DRAINAGE, 'rainwater_downpipe_registration')
require File.join(DRAINAGE, 'registration')

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
require File.join(STRUCTURE, 'foundation_definition')
require File.join(STRUCTURE, 'rebar_set_definition')
require File.join(STRUCTURE, 'repository')
require File.join(STRUCTURE, 'coordination_capability')
require File.join(STRUCTURE, 'validators', 'structure_validator')
require File.join(STRUCTURE, 'quantity', 'structure_quantity_provider')

SURFACE = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'surface')
require File.join(SURFACE, 'slope_definition')
require File.join(SURFACE, 'surface_assembly_definition')
require File.join(SURFACE, 'control_joint_definition')
require File.join(SURFACE, 'tree_pit_definition')
require File.join(SURFACE, 'path_surface_definition')
require File.join(SURFACE, 'surface_definition')
require File.join(SURFACE, 'pattern_definition')
require File.join(SURFACE, 'paving_layout_definition')
require File.join(SURFACE, 'layout_solver')
require File.join(SURFACE, 'border_definition')
require File.join(SURFACE, 'parking_layout_definition')
require File.join(SURFACE, 'repository')
require File.join(SURFACE, 'validators', 'surface_validator')
require File.join(SURFACE, 'quantity', 'surface_quantity_provider')
require File.join(SURFACE, 'geometry')
require File.join(SURFACE, 'registration')
require File.join(SURFACE, 'layout_registration')

ELECTRICAL = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'electrical')
require File.join(ELECTRICAL, 'cable_definition')
require File.join(ELECTRICAL, 'circuit_definition')
require File.join(ELECTRICAL, 'conduit_route_definition')
require File.join(ELECTRICAL, 'conduit_route_solver')
require File.join(ELECTRICAL, 'conduit_sizing_engine')
require File.join(ELECTRICAL, 'device_definition')
require File.join(ELECTRICAL, 'panelboard_definition')
require File.join(ELECTRICAL, 'voltage_drop_calculator')
require File.join(ELECTRICAL, 'repository')
require File.join(ELECTRICAL, 'geometry')
require File.join(ELECTRICAL, 'quantity', 'electrical_quantity_provider')
require File.join(ELECTRICAL, 'registration')

INTERIOR = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'interior')
require File.join(INTERIOR, 'cabinet_run_definition')
require File.join(INTERIOR, 'countertop_definition')
require File.join(INTERIOR, 'wardrobe_definition')
require File.join(INTERIOR, 'false_ceiling_definition')
require File.join(INTERIOR, 'wall_paneling_definition')
require File.join(INTERIOR, 'joinery_part_set_definition')
require File.join(INTERIOR, 'joinery_part_generator')
require File.join(INTERIOR, 'nesting_result_definition')
require File.join(INTERIOR, 'sheet_nesting_engine')
require File.join(INTERIOR, 'cut_list_exporter')
require File.join(INTERIOR, 'cnc_operation_generator')
require File.join(INTERIOR, 'repository')
require File.join(INTERIOR, 'geometry')
require File.join(INTERIOR, 'validators', 'interior_validator')
require File.join(INTERIOR, 'quantity', 'interior_quantity_provider')
require File.join(INTERIOR, 'registration')

LIBRARY = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'library')
require File.join(LIBRARY, 'catalog_asset_definition')
require File.join(LIBRARY, 'project_asset_snapshot')
require File.join(LIBRARY, 'catalog_store')
require File.join(LIBRARY, 'placed_asset_definition')
require File.join(LIBRARY, 'placed_asset_repository')
require File.join(LIBRARY, 'compatibility_engine')
require File.join(LIBRARY, 'variant_matrix')
require File.join(LIBRARY, 'lod_manager')
require File.join(LIBRARY, 'geometry')
require File.join(LIBRARY, 'catalog_capability')
require File.join(LIBRARY, 'registration')

COSTING = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'costing')
require File.join(COSTING, 'rate_item')
require File.join(COSTING, 'rate_library')
require File.join(COSTING, 'cost_estimate_line')
require File.join(COSTING, 'cost_estimate')
require File.join(COSTING, 'costing_engine')
require File.join(COSTING, 'estimate_snapshot')
require File.join(COSTING, 'boq_exporter')
require File.join(COSTING, 'repository')
require File.join(COSTING, 'registration')

require File.join(CORE, 'drawing_sheet_spec')
require File.join(CORE, 'drawing_intent_registry')
require File.join(CORE, 'elevation_generator')
require File.join(CORE, 'section_generator')
require File.join(CORE, 'detail_callout_definition')
require File.join(CORE, 'door_window_schedule_generator')
require File.join(CORE, 'joinery_shop_drawing_generator')

QA = File.join(CORE, 'qa')
require File.join(QA, 'validator_registry')
require File.join(QA, 'revision_tracker')
require File.join(QA, 'site_verification_definition')
require File.join(QA, 'stale_audit_service')

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

class FakeFace
  def valid?
    true
  end

  def erase!
    true
  end
end

class FakeEdge
  def valid?
    true
  end
end

class FakeEntities
  include Enumerable

  def initialize(children = [])
    @children = children.is_a?(Array) ? children : []
  end

  def each(&block)
    @children.each(&block)
  end

  def <<(item)
    @children << item
    self
  end

  def push(item)
    @children << item
    self
  end

  def [](idx)
    @children[idx]
  end

  def length
    @children.length
  end

  alias size length

  def delete(item)
    @children.delete(item)
  end

  def add_group
    child = FakeEntity.new
    @children << child
    child
  end

  def clear!
    @children.clear
  end

  def add_face(*_args)
    FakeFace.new
  end

  def add_line(*_args)
    FakeEdge.new
  end

  def add_edges(*_args)
    [FakeEdge.new]
  end

  def to_a
    @children.dup
  end
end

class FakeEntity < FakeAttributeCarrier
  attr_accessor :name
  attr_reader :entities

  def initialize(children = [])
    super()
    @entities = children.is_a?(FakeEntities) ? children : FakeEntities.new(children)
    @name = nil
  end
end

class FakeModel < FakeAttributeCarrier
  attr_reader :entities, :operations, :selection

  def initialize(entities = [])
    super()
    @entities = entities.is_a?(FakeEntities) ? entities : FakeEntities.new(entities)
    @operations = []
    @selection = []
  end

  def active_entities
    @entities
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
end

module Geom
  class Point3d
    attr_reader :x, :y, :z

    def initialize(x = 0.0, y = 0.0, z = 0.0)
      @x = x.to_f
      @y = y.to_f
      @z = z.to_f
    end

    def to_a
      [@x, @y, @z]
    end
  end
end unless defined?(Geom)

def build_test_runtime(model = FakeModel.new)
  active_model = model
  diagnostics = JiraNot::ConstructFlow::Core::DiagnosticLog.new
  events = JiraNot::ConstructFlow::Core::EventBus.new(diagnostics: diagnostics)
  transactions = JiraNot::ConstructFlow::Core::TransactionManager.new(model: active_model)
  commands = JiraNot::ConstructFlow::Core::CommandBus.new(
    event_bus: events,
    diagnostics: diagnostics,
    transaction_manager: transactions
  )
  modules = JiraNot::ConstructFlow::Core::ModuleRegistry.new
  modules.register(manifest: {
    id: 'constructflow.core', name: 'Core', version: '0.1.0', schema_version: 1,
    requires: [], provides: %w[core.objects core.events core.commands core.levels],
    optional_capabilities: [], objects: [], commands: [], events: [], providers: [], validators: []
  })
  loader = JiraNot::ConstructFlow::Core::ModuleLoader.new(registry: modules)
  capabilities = JiraNot::ConstructFlow::Core::CapabilityRegistry.new
  smarts = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: active_model)
  levels = JiraNot::ConstructFlow::Core::LevelRegistry.new
  connectors = JiraNot::ConstructFlow::Core::ConnectorRegistry.new(diagnostics: diagnostics)
  connectors.attach_model(active_model)
  project = JiraNot::ConstructFlow::Core::ProjectStore.new(active_model)
  project.ensure_project!(name: 'test-proj')

  Struct.new(:events, :commands, :modules, :module_loader,
             :capabilities, :smart_objects, :connectors, :levels,
             :project, :active_model).new(
    events, commands, modules, loader, capabilities,
    smarts, connectors, levels, project, active_model
  )
end
