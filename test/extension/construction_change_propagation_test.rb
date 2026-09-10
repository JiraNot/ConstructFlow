# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/drawing_issue_set')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/cabinet_run_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/quantity/interior_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/device_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/quantity/electrical_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/structure/extension_command_registration')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_takeoff')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_issue_set_factory')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_currentness_audit')

class PropagationEntity < FakeAttributeCarrier
  attr_reader :erased

  def erase!
    @erased = true
    true
  end
end

PropagationObject = Struct.new(
  :id, :type, :owner_module, :entity, :created_phase, :removed_phase,
  :source_state, :relationships, :display_name, :updated_at,
  keyword_init: true
)

class PropagationSmartObjects
  attr_reader :objects

  def initialize
    @objects = []
    @by_entity = {}
    @next_id = 1
  end

  def seed(object)
    @objects << object
    @by_entity[object.entity] = object
    object
  end

  def all
    @objects.dup
  end

  def fetch_by_id(id)
    @objects.find { |object| object.id.to_s == id.to_s }
  end

  def create(entity:, type:, owner_module:, display_name: nil, created_phase:, source_state:, **_options)
    object = PropagationObject.new(
      id: "generated-#{@next_id}",
      type: type,
      owner_module: owner_module,
      entity: entity,
      created_phase: created_phase,
      removed_phase: nil,
      source_state: source_state,
      relationships: [],
      display_name: display_name || type,
      updated_at: "2026-09-10T00:00:#{format('%02d', @next_id)}Z"
    )
    @next_id += 1
    seed(object)
  end

  def add_relationship(entity, kind:, target_id:, role: nil, metadata: {})
    object = @by_entity.fetch(entity)
    object.relationships << {
      'kind' => kind.to_s,
      'target_id' => target_id.to_s,
      'role' => role&.to_s,
      'metadata' => metadata
    }
  end

  def remove_relationship(entity, relationship_id: nil, kind: nil, target_id: nil)
    object = @by_entity.fetch(entity)
    before = object.relationships.length
    object.relationships.reject! do |relationship|
      id_match = relationship_id.nil? || relationship['id'].to_s == relationship_id.to_s
      kind_match = kind.nil? || relationship['kind'].to_s == kind.to_s
      target_match = target_id.nil? || relationship['target_id'].to_s == target_id.to_s
      id_match && kind_match && target_match
    end
    before - object.relationships.length
  end

  def mark_dirty(_entity, *_flags)
    true
  end

  def erase!(entity)
    object = @by_entity.delete(entity)
    raise KeyError, 'unknown propagation object' unless object

    entity.erase!
    @objects.delete(object)
    object
  end
end

class PropagationStructureGeometry
  def create_column_group(_model, _definition)
    PropagationEntity.new
  end

  def rebuild_column!(entity, _definition)
    entity
  end

  def create_foundation_group(_model, _definition)
    PropagationEntity.new
  end

  def rebuild_foundation!(entity, _definition)
    entity
  end
end

PropagationRuntime = Struct.new(:smart_objects, :active_model, :levels)

class ConstructionChangePropagationTest < Minitest::Test
  def setup
    @objects = PropagationSmartObjects.new
    @runtime = PropagationRuntime.new(@objects, Object.new, nil)
    @extension_entity = PropagationEntity.new
    @extension = PropagationObject.new(
      id: 'ext-1',
      type: 'extension.zone',
      owner_module: 'constructflow.extension',
      entity: @extension_entity,
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil,
      source_state: 'confirmed',
      relationships: [],
      display_name: 'Kitchen Extension',
      updated_at: '2026-09-10T00:00:00Z'
    )
    @objects.seed(@extension)
    @extension_repository = JiraNot::ConstructFlow::Extension::Repository.new
    @structure_repository = JiraNot::ConstructFlow::Structure::Repository.new
    @geometry = PropagationStructureGeometry.new
    @validator = JiraNot::ConstructFlow::Structure::Validators::StructureValidator.new
  end

  def definition(boundary)
    JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
      boundary_mm: boundary,
      program: 'kitchen',
      mode: 'construction',
      target_height_mm: 2800
    )
  end

  def intent(boundary)
    {
      'extension_id' => 'ext-1',
      'program' => 'kitchen',
      'mode' => 'construction',
      'boundary_mm' => boundary,
      'base_offset_mm' => 0,
      'target_height_mm' => 2800,
      'config' => {
        'column_section_mm' => [200, 200],
        'foundation' => 'auto',
        'foundation_size_mm' => [800, 800, 300]
      }
    }
  end

  def generate(boundary)
    JiraNot::ConstructFlow::Structure::ExtensionCommandRegistration.generate_or_update(
      runtime: @runtime,
      input: { 'extension_id' => 'ext-1', 'intent' => intent(boundary) },
      repository: @structure_repository,
      geometry: @geometry,
      validator: @validator
    )
  end

  def drawing_refresh_for_structure(factory)
    ids = factory.object_ids_for_family(extension_id: 'ext-1', family: 'structure')
    [{
      'preset_id' => 'structure.construction',
      'scene_name' => 'ConstructFlow - Structure Plan - Construction',
      'source_object_ids' => ids,
      'rendered_count' => ids.length,
      'rendered_object_ids' => ids
    }]
  end

  def test_boundary_change_reconciles_model_takeoff_and_drawing_scope_without_stale_ids
    rectangle = [[0, 0, 0], [6000, 0, 0], [6000, 4000, 0], [0, 4000, 0]]
    triangle = [[0, 0, 0], [6000, 0, 0], [0, 4000, 0]]
    @extension_repository.write(@extension_entity, definition(rectangle))

    first = generate(rectangle)
    first_structure_ids = @objects.all.select { |object| object.owner_module == 'constructflow.structure' }.map(&:id).sort
    assert_equal 8, first_structure_ids.length
    assert_equal 8, first[:created_object_ids].length

    first_takeoff = JiraNot::ConstructFlow::Extension::ConstructionTakeoff.new(runtime: @runtime).build('ext-1')
    first_factory = JiraNot::ConstructFlow::Extension::ConstructionIssueSetFactory.new(runtime: @runtime)
    first_drawing_refresh = drawing_refresh_for_structure(first_factory)
    first_audit = JiraNot::ConstructFlow::Extension::ConstructionCurrentnessAudit.new(
      runtime: @runtime,
      issue_factory: first_factory
    ).run(
      extension_id: 'ext-1',
      takeoff: first_takeoff,
      drawing_refresh: first_drawing_refresh,
      drawings_required: true
    )
    assert_equal 'current', first_audit['status']

    @extension_repository.write(@extension_entity, definition(triangle))
    second = generate(triangle)
    assert_equal 2, second[:removed_object_ids].length
    stale_ids = second[:removed_object_ids].sort
    assert stale_ids.all? { |id| @objects.fetch_by_id(id).nil? }

    second_structure_ids = @objects.all.select { |object| object.owner_module == 'constructflow.structure' }.map(&:id).sort
    assert_equal 6, second_structure_ids.length
    assert_empty stale_ids & second_structure_ids

    second_takeoff = JiraNot::ConstructFlow::Extension::ConstructionTakeoff.new(runtime: @runtime).build('ext-1')
    takeoff_source_ids = second_takeoff['items'].map { |item| item[:source_object_id].to_s }.uniq.sort
    assert_empty stale_ids & takeoff_source_ids
    assert_equal 3, second_takeoff['totals'].find { |item| item['classification'] == 'structure.spread_footing.concrete' }['source_object_ids'].length

    second_factory = JiraNot::ConstructFlow::Extension::ConstructionIssueSetFactory.new(runtime: @runtime)
    current_structure_scope = second_factory.object_ids_for_family(extension_id: 'ext-1', family: 'structure')
    assert_equal second_structure_ids, current_structure_scope
    assert_empty stale_ids & current_structure_scope

    stale_audit = JiraNot::ConstructFlow::Extension::ConstructionCurrentnessAudit.new(
      runtime: @runtime,
      issue_factory: second_factory
    ).run(
      extension_id: 'ext-1',
      takeoff: first_takeoff,
      drawing_refresh: first_drawing_refresh,
      drawings_required: true
    )
    assert_equal 'stale', stale_audit['status']
    refute stale_audit['publishable']

    current_audit = JiraNot::ConstructFlow::Extension::ConstructionCurrentnessAudit.new(
      runtime: @runtime,
      issue_factory: second_factory
    ).run(
      extension_id: 'ext-1',
      takeoff: second_takeoff,
      drawing_refresh: drawing_refresh_for_structure(second_factory),
      drawings_required: true
    )
    assert_equal 'current', current_audit['status']
    assert current_audit['publishable']
    refute_equal first_audit['scope_fingerprint'], current_audit['scope_fingerprint']
  end
end
