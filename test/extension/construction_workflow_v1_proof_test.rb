# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/drawing_issue_set')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/cabinet_run_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/quantity/interior_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/device_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/repository')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/quantity/electrical_quantity_provider')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/downpipe_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/rainwater_package_integration')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_intent_store')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_takeoff')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_quality_gate')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_issue_set_factory')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_currentness_audit')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_output_settlement')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_issue_history_store')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_workflow_runner')

class ConstructionWorkflowV1ProofTest < Minitest::Test
  ProofObject = Struct.new(
    :id, :type, :owner_module, :entity, :created_phase, :removed_phase,
    :source_state, :relationships, :display_name, :updated_at,
    keyword_init: true
  )

  class ProofObjects
    attr_reader :clear_calls

    def initialize(values)
      @values = values
      @clear_calls = []
    end

    def all = @values

    def fetch_by_id(id)
      @values.find { |object| object.id.to_s == id.to_s }
    end

    def clear_dirty(entity, *flags)
      object = @values.find { |value| value.entity.equal?(entity) }
      raise KeyError, 'proof object not found' unless object

      @clear_calls << [object.id.to_s, flags.map(&:to_s)]
      object
    end
  end

  class ProofPlanScenes
    attr_reader :refreshes

    def initialize
      @refreshes = []
    end

    def refresh_preset(preset_id, object_ids:)
      ids = Array(object_ids).map(&:to_s).sort
      @refreshes << { 'preset_id' => preset_id.to_s, 'object_ids' => ids }
      {
        'scene_name' => "Scene #{preset_id}",
        'rendered_count' => ids.length,
        'rendered_object_ids' => ids
      }
    end
  end

  class ProofIssueSets
    def build(issue_set)
      {
        'id' => issue_set.id,
        'preset_ids' => issue_set.sheets.map(&:preset_id),
        'sheet_numbers' => issue_set.sheets.map { |sheet| sheet.options[:sheet_number] }
      }
    end
  end

  class ProofNativeIssueSets
    attr_reader :exports

    def initialize
      @exports = []
    end

    def export(issue_set, layout_path:, pdf_path:, **_options)
      @exports << issue_set.id
      {
        'layout_path' => layout_path,
        'pdf_path' => pdf_path,
        'native_backend' => 'proof_backend',
        'template_resolution' => {
          'source' => 'company_registry',
          'key' => 'company.a3.construction',
          'version' => '1',
          'sha256' => 'proof-template-sha',
          'asset_verified' => true
        }
      }
    end
  end

  class ProofCapabilities
    def fetch(_id)
      raise KeyError, 'capability unavailable in pure-Ruby proof runtime'
    end
  end

  class ProofRuntime
    attr_reader :smart_objects, :connectors, :capabilities, :project, :plan_scenes,
                :drawing_issue_sets, :native_layout_issue_sets, :planned_options, :active_model

    def initialize(objects:, model:, connectors:)
      @smart_objects = ProofObjects.new(objects)
      @active_model = model
      @connectors = connectors
      @capabilities = ProofCapabilities.new
      @project = Struct.new(:project_id).new('project-proof')
      @plan_scenes = ProofPlanScenes.new
      @drawing_issue_sets = ProofIssueSets.new
      @native_layout_issue_sets = ProofNativeIssueSets.new
    end

    def extension_plan(_definition, options = {})
      @planned_options = options
      { 'extension_id' => options['extension_id'], 'steps' => [] }
    end

    def execute_extension(_plan, dry_run:, actor:, project_id:)
      raise 'unexpected dry run' if dry_run
      raise 'actor missing' unless actor
      raise 'project missing' if project_id.to_s.empty?

      {
        'extension_id' => 'ext-1',
        'status' => 'success',
        'dry_run' => false,
        'steps' => [],
        'dirty_domains' => []
      }
    end
  end

  def test_full_construction_package_reaches_export_with_current_cross_domain_evidence
    model = FakeModel.new
    connectors = JiraNot::ConstructFlow::Core::ConnectorRegistry.new.attach_model(model)
    connectors.register_compatibility(
      'roof.gutter_outlet', 'drainage.manhole_in', system: 'drainage.rainwater'
    )

    extension = proof_object('ext-1', 'extension.zone', 'constructflow.extension', display_name: 'Kitchen Extension')
    existing_wall = proof_object(
      'wall-existing', 'architecture.wall', 'constructflow.architecture',
      phase: JiraNot::ConstructFlow::Core::Phase::EXISTING
    )
    extension_wall = proof_object(
      'wall-new', 'architecture.wall', 'constructflow.architecture', relationships: [generated_from('ext-1')]
    )
    opening = proof_object(
      'opening-1', 'opening.rectangular', 'constructflow.opening',
      relationships: [
        generated_from('ext-1'),
        { 'kind' => 'host', 'target_id' => 'wall-existing', 'role' => 'modifies_existing_host' }
      ]
    )
    column = proof_object(
      'column-1', 'structure.column', 'constructflow.structure', relationships: [generated_from('ext-1')]
    )
    foundation = proof_object(
      'foundation-1', 'structure.foundation', 'constructflow.structure', relationships: [generated_from('ext-1')]
    )
    roof = proof_object(
      'roof-1', 'roof.system', 'constructflow.roof', relationships: [generated_from('ext-1')]
    )
    gutter = proof_object(
      'gutter-1', 'roof.gutter', 'constructflow.roof', relationships: [generated_from('ext-1')]
    )
    downpipe = proof_object(
      'downpipe-1', 'drainage.downpipe', 'constructflow.drainage', relationships: [generated_from('ext-1')]
    )
    surface = proof_object(
      'surface-1', 'surface.boundary', 'constructflow.surface', relationships: [generated_from('ext-1')]
    )
    cabinet = proof_object(
      'cabinet-1', 'interior.cabinet_run', 'constructflow.interior', relationships: [generated_from('ext-1')]
    )
    light = proof_object(
      'light-1', 'electrical.luminaire', 'constructflow.electrical', relationships: [generated_from('ext-1')]
    )
    foreign_column = proof_object(
      'foreign-column', 'structure.column', 'constructflow.structure', relationships: [generated_from('ext-foreign')]
    )

    objects = [
      extension, existing_wall, extension_wall, opening, column, foundation, roof, gutter,
      downpipe, surface, cabinet, light, foreign_column
    ]
    runtime = ProofRuntime.new(objects: objects, model: model, connectors: connectors)

    persist_semantic_definitions(
      extension: extension,
      existing_wall: existing_wall,
      extension_wall: extension_wall,
      opening: opening,
      column: column,
      foundation: foundation,
      roof: roof,
      gutter: gutter,
      downpipe: downpipe,
      surface: surface,
      cabinet: cabinet,
      light: light,
      connectors: connectors
    )

    result = JiraNot::ConstructFlow::Extension::ConstructionWorkflowRunner.new(runtime: runtime).run(
      extension_id: 'ext-1',
      strict: true,
      refresh_drawings: true,
      revision: 'C01',
      issue_status: 'construction',
      project_name: 'Proof Project',
      project_number: 'CF-V1',
      drawn_by: 'ConstructFlow',
      checked_by: 'QA',
      export: {
        layout_path: '/tmp/CF-V1-C01.layout',
        pdf_path: '/tmp/CF-V1-C01.pdf',
        verify_template_asset: false
      }
    )

    assert_equal 'exported', result['status']
    assert result.dig('quality_gate', 'publishable'), result.dig('quality_gate', 'issues').inspect
    assert result.dig('output_settlement', 'publishable')
    assert_equal 'current', result.dig('currentness', 'status')
    assert result.dig('currentness', 'publishable')

    expected_presets = %w[
      architecture.demolition
      architecture.construction
      structure.construction
      roof.construction
      plumbing.construction
      surface.construction
      interior.construction
      electrical.construction
    ]
    assert_equal expected_presets, result.dig('issue_set', 'preset_ids')
    assert_equal %w[A-100 A-101 S-101 R-101 P-101 L-101 I-101 E-101], result.dig('issue_set', 'sheet_numbers')
    assert_equal expected_presets, runtime.plan_scenes.refreshes.map { |entry| entry['preset_id'] }

    takeoff_ids = result.dig('takeoff', 'coverage').map { |entry| entry['object_id'] }.sort
    expected_takeoff_ids = objects.reject { |object| %w[wall-existing foreign-column].include?(object.id) }.map(&:id).sort
    assert_equal expected_takeoff_ids, takeoff_ids
    assert result.dig('takeoff', 'coverage').all? { |entry| entry['status'] == 'included' }

    structure_refresh = result['drawing_refresh'].find { |entry| entry['preset_id'] == 'structure.construction' }
    assert_equal %w[column-1 foundation-1], structure_refresh['source_object_ids']
    refute_includes structure_refresh['source_object_ids'], 'foreign-column'

    architecture_refresh = result['drawing_refresh'].find { |entry| entry['preset_id'] == 'architecture.construction' }
    assert_equal %w[opening-1 wall-existing wall-new], architecture_refresh['source_object_ids']

    roof_refresh = result['drawing_refresh'].find { |entry| entry['preset_id'] == 'roof.construction' }
    assert_equal %w[gutter-1 roof-1], roof_refresh['source_object_ids']
    plumbing_refresh = result['drawing_refresh'].find { |entry| entry['preset_id'] == 'plumbing.construction' }
    assert_equal ['downpipe-1'], plumbing_refresh['source_object_ids']

    refute_nil result['output_state']
    assert_equal 'exported', result.dig('output_state', 'export_status')
    refute_nil result['issue_history_entry']
    assert_equal 'C01', result.dig('issue_history_entry', 'revision')
    assert_equal '/tmp/CF-V1-C01.layout', result.dig('issue_history_entry', 'layout_path')
    assert_equal '/tmp/CF-V1-C01.pdf', result.dig('issue_history_entry', 'pdf_path')
    assert_equal 1, runtime.native_layout_issue_sets.exports.length
  end

  private

  def proof_object(id, type, owner, entity: FakeEntity.new, phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION,
                   relationships: [], display_name: nil)
    ProofObject.new(
      id: id,
      type: type,
      owner_module: owner,
      entity: entity,
      created_phase: phase,
      removed_phase: nil,
      source_state: 'confirmed',
      relationships: relationships,
      display_name: display_name || id,
      updated_at: '2026-09-11T12:00:00Z'
    )
  end

  def generated_from(extension_id)
    { 'kind' => 'generated_from', 'target_id' => extension_id, 'role' => 'extension_source' }
  end

  def persist_semantic_definitions(extension:, existing_wall:, extension_wall:, opening:, column:, foundation:,
                                   roof:, gutter:, downpipe:, surface:, cabinet:, light:, connectors:)
    boundary = [[0, 0, 0], [6000, 0, 0], [6000, 4000, 0], [0, 4000, 0]]
    JiraNot::ConstructFlow::Extension::Repository.new.write(
      extension.entity,
      JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
        boundary_mm: boundary,
        program: 'kitchen',
        mode: 'construction',
        target_height_mm: 3000,
        roof_intent: 'lean_to',
        attachment_host_id: existing_wall.id
      )
    )

    wall_repository = JiraNot::ConstructFlow::Architecture::WallRepository.new
    wall_repository.write(
      existing_wall.entity,
      JiraNot::ConstructFlow::Architecture::WallDefinition.new(
        path_mm: [[0, 0, 0], [6000, 0, 0]], thickness_mm: 100, height_mm: 3000,
        wall_type_id: 'company.existing.wall.100'
      )
    )
    wall_repository.write(
      extension_wall.entity,
      JiraNot::ConstructFlow::Architecture::WallDefinition.new(
        path_mm: [[6000, 0, 0], [6000, 4000, 0]], thickness_mm: 100, height_mm: 3000,
        wall_type_id: 'company.new.wall.100'
      )
    )
    JiraNot::ConstructFlow::Opening::OpeningRepository.new.write(
      opening.entity,
      JiraNot::ConstructFlow::Opening::OpeningDefinition.new(
        host_object_id: existing_wall.id,
        segment_index: 0,
        start_offset_mm: 1800,
        width_mm: 1200,
        height_mm: 2100,
        sill_mm: 0
      )
    )

    structure_repository = JiraNot::ConstructFlow::Structure::Repository.new
    structure_repository.write_column(
      column.entity,
      JiraNot::ConstructFlow::Structure::ColumnDefinition.new(
        location_mm: [6000, 4000, 0],
        section_mm: [200, 200],
        base_elevation_mm: 0,
        top_elevation_mm: 3000,
        engineering_status: 'engineer_approved'
      )
    )
    structure_repository.write_foundation(
      foundation.entity,
      JiraNot::ConstructFlow::Structure::FoundationDefinition.new(
        center_mm: [6000, 4000, -300],
        size_mm: [800, 800, 300],
        top_elevation_mm: 0,
        supported_object_id: column.id,
        engineering_status: 'engineer_approved'
      )
    )

    roof_repository = JiraNot::ConstructFlow::Roof::Repository.new
    roof_repository.write_roof(
      roof.entity,
      JiraNot::ConstructFlow::Roof::RoofDefinition.new(
        boundary_mm: boundary.map { |point| [point[0], point[1], 3000] },
        roof_form: 'lean_to',
        slope_percent: 5,
        slope_direction_xy: [0, 1],
        low_elevation_mm: 3000,
        covering_system: 'metal_sheet',
        generated_from_id: extension.id
      )
    )

    outlet = connectors.register_connector(
      owner_object_id: gutter.id,
      type: 'roof.gutter_outlet',
      role: 'outlet',
      position_mm: [6000, 4000, 3000],
      properties: { rainwater_plan_managed: true, outlet_index: 0 }
    )
    target = connectors.register_connector(
      owner_object_id: 'site-rainwater-target',
      type: 'drainage.manhole_in',
      role: 'inlet',
      position_mm: [6000, 4000, 0]
    )
    connection = connectors.register_connection(
      from_connector_id: outlet['id'],
      to_connector_id: target['id'],
      system: 'drainage.rainwater',
      metadata: { route_object_id: downpipe.id, route_kind: 'downpipe' }
    )
    roof_repository.write_gutter(
      gutter.entity,
      JiraNot::ConstructFlow::Roof::GutterDefinition.new(
        roof_object_id: roof.id,
        edge_index: 2,
        profile_id: 'company.gutter.150',
        outlet_ratio: 1.0,
        outlet_connector_id: outlet['id']
      )
    )
    JiraNot::ConstructFlow::Core::AttributeStore.new(gutter.entity).write_json(
      'rainwater_plan_application',
      {
        'format' => 'constructflow.roof_rainwater_plan_application.v1',
        'outlet_connector_ids' => [outlet['id']],
        'plan_fingerprint' => 'proof-rainwater-plan'
      },
      dictionary: JiraNot::ConstructFlow::Roof::Repository::DICTIONARY
    )

    JiraNot::ConstructFlow::Drainage::Repository.new.write_downpipe(
      downpipe.entity,
      JiraNot::ConstructFlow::Drainage::DownpipeDefinition.new(
        route_nodes_mm: [outlet['position_mm'], target['position_mm']],
        start_connector_id: outlet['id'],
        end_connector_id: target['id'],
        diameter_mm: 100,
        connection_id: connection['id']
      )
    )

    JiraNot::ConstructFlow::Surface::Repository.new.write_surface(
      surface.entity,
      JiraNot::ConstructFlow::Surface::SurfaceDefinition.new(
        outer_boundary_mm: boundary,
        surface_type: 'concrete',
        base_elevation_mm: 0
      )
    )
    JiraNot::ConstructFlow::Interior::Repository.new.write_cabinet_run(
      cabinet.entity,
      JiraNot::ConstructFlow::Interior::CabinetRunDefinition.new(
        origin_mm: [500, 500, 0],
        width_mm: 2400,
        height_mm: 900,
        depth_mm: 600,
        mode: 'design'
      )
    )
    JiraNot::ConstructFlow::Electrical::Repository.new.write_device(
      light.entity,
      JiraNot::ConstructFlow::Electrical::DeviceDefinition.new(
        kind: 'luminaire',
        device_type: 'general_light',
        position_mm: [3000, 2000, 2900],
        mounting: 'ceiling',
        wattage: 12
      )
    )
  end
end
