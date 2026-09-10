# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/drawing_issue_set')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/cabinet_run_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/quantity/interior_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/device_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/quantity/electrical_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_takeoff')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_quality_gate')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_issue_set_factory')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_workflow_runner')

ConstructionWorkflowObject = Struct.new(
  :id, :type, :owner_module, :entity, :created_phase, :removed_phase,
  :source_state, :relationships, :display_name,
  keyword_init: true
)

class ConstructionWorkflowObjects
  def initialize(objects)
    @objects = objects
  end

  def all
    @objects
  end

  def fetch_by_id(id)
    @objects.find { |object| object.id.to_s == id.to_s }
  end
end

class ConstructionWorkflowRuntime
  attr_reader :smart_objects, :project, :planned_options

  def initialize(objects, execution: nil)
    @smart_objects = ConstructionWorkflowObjects.new(objects)
    @project = Struct.new(:project_id).new('project-1')
    @execution = execution || {
      'extension_id' => objects.first.id,
      'status' => 'success',
      'dry_run' => true,
      'steps' => [],
      'dirty_domains' => []
    }
  end

  def extension_plan(_definition, options = {})
    @planned_options = options
    { 'extension_id' => options['extension_id'], 'steps' => [] }
  end

  def execute_extension(_plan, dry_run:, actor:, project_id:)
    raise 'expected dry run' unless dry_run
    raise 'actor missing' unless actor
    raise 'project missing' if project_id.to_s.empty?
    @execution
  end
end

class ConstructionWorkflowTest < Minitest::Test
  def extension_definition
    JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
      boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]],
      program: 'kitchen', mode: 'construction', target_height_mm: 2800
    )
  end

  def object(id:, type:, owner:, entity: FakeEntity.new, source_state: 'confirmed', relationships: [], display_name: nil)
    ConstructionWorkflowObject.new(
      id: id,
      type: type,
      owner_module: owner,
      entity: entity,
      created_phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
      removed_phase: nil,
      source_state: source_state,
      relationships: relationships,
      display_name: display_name || id
    )
  end

  def generated_from(extension_id)
    [{ 'kind' => 'generated_from', 'target_id' => extension_id, 'role' => 'extension_source' }]
  end

  def test_electrical_quantity_provider_is_phase_aware_and_traceable
    device = JiraNot::ConstructFlow::Electrical::DeviceDefinition.new(
      kind: 'luminaire', device_type: 'downlight', position_mm: [1000, 1000, 2800],
      mounting: 'ceiling', wattage: 9
    )
    smart_object = object(id: 'light-1', type: 'electrical.luminaire', owner: 'constructflow.electrical')
    item = JiraNot::ConstructFlow::Electrical::Quantity::ElectricalQuantityProvider.new
           .device_quantities(smart_object: smart_object, definition: device).first

    assert_equal 'light-1', item[:source_object_id]
    assert_equal 'electrical.luminaire.unit', item[:classification]
    assert_equal JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION, item[:phase_scope]
    assert_equal 1.0, item[:value]
  end

  def test_construction_takeoff_aggregates_extension_and_generated_electrical_quantities
    extension_entity = FakeEntity.new
    extension = object(
      id: 'ext-1', type: 'extension.zone', owner: 'constructflow.extension',
      entity: extension_entity, display_name: 'Kitchen Extension'
    )
    JiraNot::ConstructFlow::Extension::Repository.new.write(extension_entity, extension_definition)

    light_entity = FakeEntity.new
    light = object(
      id: 'light-1', type: 'electrical.luminaire', owner: 'constructflow.electrical',
      entity: light_entity, source_state: 'assumed', relationships: generated_from('ext-1')
    )
    JiraNot::ConstructFlow::Electrical::Repository.new.write_device(
      light_entity,
      JiraNot::ConstructFlow::Electrical::DeviceDefinition.new(
        kind: 'luminaire', device_type: 'extension_general_light',
        position_mm: [2000, 1500, 2800], mounting: 'ceiling'
      )
    )

    runtime = Struct.new(:smart_objects).new(ConstructionWorkflowObjects.new([extension, light]))
    takeoff = JiraNot::ConstructFlow::Extension::ConstructionTakeoff.new(runtime: runtime).build('ext-1')

    assert_equal 2, takeoff['object_count']
    assert_equal 3, takeoff['item_count']
    classifications = takeoff['totals'].map { |total| total['classification'] }
    assert_includes classifications, 'extension.zone.area'
    assert_includes classifications, 'extension.zone.perimeter'
    assert_includes classifications, 'electrical.luminaire.unit'
  end

  def test_strict_quality_gate_blocks_preliminary_structure
    extension = object(id: 'ext-1', type: 'extension.zone', owner: 'constructflow.extension')
    column_entity = FakeEntity.new
    column = object(
      id: 'column-1', type: 'structure.column', owner: 'constructflow.structure',
      entity: column_entity, relationships: generated_from('ext-1')
    )
    JiraNot::ConstructFlow::Structure::Repository.new.write_column(
      column_entity,
      JiraNot::ConstructFlow::Structure::ColumnDefinition.new(
        location_mm: [0, 0, 0], base_elevation_mm: 0, top_elevation_mm: 2800,
        engineering_status: 'preliminary'
      )
    )
    runtime = Struct.new(:smart_objects).new(ConstructionWorkflowObjects.new([extension, column]))
    execution = { 'status' => 'success', 'steps' => [{ 'domain' => 'structure', 'warnings' => [], 'errors' => [] }], 'dirty_domains' => [] }

    result = JiraNot::ConstructFlow::Extension::ConstructionQualityGate.new(runtime: runtime).run(
      extension_id: 'ext-1', execution: execution, strict: true
    )

    refute result['publishable']
    issue = result['issues'].find { |value| value['rule_id'] == 'construction.structure.engineering_status' }
    refute_nil issue
    assert_equal 'error', issue['severity']
  end

  def test_strict_quality_gate_blocks_unresolved_enabled_drainage
    extension = object(id: 'ext-1', type: 'extension.zone', owner: 'constructflow.extension')
    runtime = Struct.new(:smart_objects).new(ConstructionWorkflowObjects.new([extension]))
    execution = { 'status' => 'success', 'steps' => [{ 'domain' => 'drainage', 'warnings' => [], 'errors' => [] }], 'dirty_domains' => [] }

    result = JiraNot::ConstructFlow::Extension::ConstructionQualityGate.new(runtime: runtime).run(
      extension_id: 'ext-1', execution: execution, strict: true
    )

    refute result['publishable']
    assert result['issues'].any? { |value| value['rule_id'] == 'construction.drainage.unresolved_intent' }
  end

  def test_issue_set_factory_uses_only_active_construction_families
    extension = object(id: 'ext-1', type: 'extension.zone', owner: 'constructflow.extension', display_name: 'Kitchen')
    structure = object(
      id: 'column-1', type: 'structure.column', owner: 'constructflow.structure',
      relationships: generated_from('ext-1')
    )
    roof = object(id: 'roof-1', type: 'roof.system', owner: 'constructflow.roof', relationships: generated_from('ext-1'))
    runtime = Struct.new(:smart_objects).new(ConstructionWorkflowObjects.new([extension, structure, roof]))

    issue_set = JiraNot::ConstructFlow::Extension::ConstructionIssueSetFactory.new(runtime: runtime).build(extension_id: 'ext-1')

    assert_equal %w[structure.construction roof.construction], issue_set.sheets.map(&:preset_id)
    assert_equal %w[S-101 R-101], issue_set.sheets.map { |sheet| sheet.options[:sheet_number] }
  end

  def test_issue_set_scopes_generated_domains_to_one_extension_and_keeps_architecture_context
    extension_a = object(id: 'ext-a', type: 'extension.zone', owner: 'constructflow.extension')
    extension_b = object(id: 'ext-b', type: 'extension.zone', owner: 'constructflow.extension')
    column_a = object(
      id: 'column-a', type: 'structure.column', owner: 'constructflow.structure',
      relationships: generated_from('ext-a')
    )
    column_b = object(
      id: 'column-b', type: 'structure.column', owner: 'constructflow.structure',
      relationships: generated_from('ext-b')
    )
    roof_a = object(
      id: 'roof-a', type: 'roof.system', owner: 'constructflow.roof',
      relationships: generated_from('ext-a')
    )
    wall = object(id: 'wall-1', type: 'architecture.wall', owner: 'constructflow.architecture')
    opening = object(id: 'opening-1', type: 'opening.void', owner: 'constructflow.opening')
    runtime = Struct.new(:smart_objects).new(
      ConstructionWorkflowObjects.new([extension_a, extension_b, column_a, column_b, roof_a, wall, opening])
    )
    factory = JiraNot::ConstructFlow::Extension::ConstructionIssueSetFactory.new(runtime: runtime)

    assert_equal ['column-a'], factory.object_ids_for_family(extension_id: 'ext-a', family: 'structure')
    assert_equal ['roof-a'], factory.object_ids_for_family(extension_id: 'ext-a', family: 'roof')
    assert_equal %w[opening-1 wall-1], factory.object_ids_for_family(extension_id: 'ext-a', family: 'architecture')
    refute_includes factory.object_ids_for_family(extension_id: 'ext-a', family: 'structure'), 'column-b'
  end

  def test_workflow_dry_run_stops_before_takeoff_and_drawing_mutation
    extension_entity = FakeEntity.new
    extension = object(
      id: 'ext-1', type: 'extension.zone', owner: 'constructflow.extension',
      entity: extension_entity, display_name: 'Kitchen Extension'
    )
    JiraNot::ConstructFlow::Extension::Repository.new.write(extension_entity, extension_definition)
    runtime = ConstructionWorkflowRuntime.new([extension])

    result = JiraNot::ConstructFlow::Extension::ConstructionWorkflowRunner.new(runtime: runtime).run(
      extension_id: 'ext-1', dry_run: true
    )

    assert_equal 'preview', result['status']
    assert_nil result['quality_gate']
    assert_nil result['takeoff']
    assert_empty result['drawing_refresh']
    assert_equal 'ext-1', runtime.planned_options['extension_id']
  end
end
