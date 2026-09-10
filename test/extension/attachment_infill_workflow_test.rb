# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/cabinet_run_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/quantity/interior_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/device_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/quantity/electrical_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/generator')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/orchestrator')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_intent_store')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_takeoff')

AttachmentInfillWorkflowObject = Struct.new(
  :id, :type, :owner_module, :entity, :created_phase, :removed_phase,
  :source_state, :relationships, :display_name,
  keyword_init: true
)

class AttachmentInfillWorkflowObjects
  def initialize(objects)
    @objects = objects
  end

  def all = @objects

  def fetch_by_id(id)
    @objects.find { |object| object.id.to_s == id.to_s }
  end
end

AttachmentInfillWorkflowRuntime = Struct.new(:smart_objects, :active_model)

class AttachmentInfillWorkflowTest < Minitest::Test
  def definition
    JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
      boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]],
      program: 'kitchen', mode: 'construction', attachment_host_id: 'wall-existing'
    )
  end

  def object(id:, type:, owner:, entity:, relationships: [], source_state: 'confirmed')
    AttachmentInfillWorkflowObject.new(
      id: id,
      type: type,
      owner_module: owner,
      entity: entity,
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil,
      source_state: source_state,
      relationships: relationships,
      display_name: id
    )
  end

  def generated(slot)
    [{
      'kind' => 'generated_from',
      'target_id' => 'ext-1',
      'role' => 'extension_source',
      'metadata' => { 'slot' => slot }
    }]
  end

  def test_door_window_is_opt_in_and_runs_after_opening
    generator = JiraNot::ConstructFlow::Extension::Generator.new(definition)
    refute_includes generator.enabled_domains, 'door_window'

    plan = JiraNot::ConstructFlow::Extension::Orchestrator.new(generator).plan(
      'extension_id' => 'ext-1',
      'domains' => {
        'opening' => {
          'enabled' => true,
          'confirm_modify_existing_host' => true,
          'width_mm' => 1000,
          'height_mm' => 2100
        },
        'door_window' => {
          'enabled' => true,
          'category' => 'door',
          'operation' => 'swing',
          'frame_material' => 'wood',
          'panel_style' => 'solid'
        }
      }
    )

    domains = plan['steps'].map { |step| step['domain'] }
    assert_operator domains.index('opening'), :<, domains.index('door_window')
    door = plan['steps'].find { |step| step['domain'] == 'door_window' }
    assert_equal ['opening'], door['dependencies']
  end

  def test_explicit_door_window_disable_is_a_reconciliation_step
    generator = JiraNot::ConstructFlow::Extension::Generator.new(definition)
    plan = JiraNot::ConstructFlow::Extension::Orchestrator.new(generator).plan(
      'extension_id' => 'ext-1',
      'domains' => {
        'architecture' => { 'enabled' => false },
        'opening' => { 'enabled' => false },
        'door_window' => { 'enabled' => false },
        'structure' => { 'enabled' => false },
        'surface' => { 'enabled' => false },
        'roof' => { 'enabled' => false },
        'drainage' => { 'enabled' => false },
        'interior' => { 'enabled' => false },
        'electrical' => { 'enabled' => false }
      }
    )

    steps = plan['steps'].select { |step| %w[opening door_window drainage].include?(step['domain']) }
    assert_equal %w[opening door_window drainage], steps.map { |step| step['domain'] }
    assert steps.all? { |step| step['action'] == 'reconcile_disabled_intent' }
  end

  def test_construction_intent_accepts_durable_door_window_configuration
    entity = FakeEntity.new
    store = JiraNot::ConstructFlow::Extension::ConstructionIntentStore.new
    store.write(
      entity,
      domains: {
        door_window: {
          enabled: true,
          type_id: 'company.door.d01',
          schedule_mark: 'D01'
        }
      }
    )

    persisted = store.read(entity)
    assert_equal 'company.door.d01', persisted.dig('domains', 'door_window', 'type_id')
    assert_equal 'D01', persisted.dig('domains', 'door_window', 'schedule_mark')
  end

  def test_generated_door_window_quantities_flow_into_construction_takeoff
    model = FakeModel.new
    extension_entity = FakeEntity.new
    extension = object(id: 'ext-1', type: 'extension.zone', owner: 'constructflow.extension', entity: extension_entity)
    JiraNot::ConstructFlow::Extension::Repository.new.write(extension_entity, definition)

    type = JiraNot::ConstructFlow::DoorWindow::DoorWindowType.new(
      id: 'company.door.d01', category: 'door', operation: 'swing',
      width_mm: 1000, height_mm: 2100, frame_material: 'wood', panel_style: 'solid'
    )
    JiraNot::ConstructFlow::DoorWindow::TypeRegistry.new(model).register(type)

    infill_entity = FakeEntity.new
    infill = object(
      id: 'door-1', type: 'door_window.instance', owner: 'constructflow.door_window',
      entity: infill_entity, relationships: generated('attachment_infill')
    )
    JiraNot::ConstructFlow::DoorWindow::InstanceRepository.new.write(
      infill_entity,
      JiraNot::ConstructFlow::DoorWindow::InstanceDefinition.new(
        type_id: type.id, opening_object_id: 'opening-1', schedule_mark: 'D01'
      )
    )

    runtime = AttachmentInfillWorkflowRuntime.new(
      AttachmentInfillWorkflowObjects.new([extension, infill]),
      model
    )
    takeoff = JiraNot::ConstructFlow::Extension::ConstructionTakeoff.new(runtime: runtime).build('ext-1')
    coverage = takeoff['coverage'].find { |item| item['object_id'] == 'door-1' }
    classifications = takeoff['items'].select { |item| item[:source_object_id] == 'door-1' }.map { |item| item[:classification] }

    assert_equal 'included', coverage['status']
    assert_includes classifications, 'door_window.door.unit'
    assert_includes classifications, 'door_window.frame.perimeter'
    assert_includes classifications, 'door_window.panel.count'
  end
end
