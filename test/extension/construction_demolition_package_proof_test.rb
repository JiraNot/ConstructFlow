# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/drawing_issue_set')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_intent_store')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_takeoff')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_quality_gate')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_issue_set_factory')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_currentness_audit')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_output_settlement')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_issue_history_store')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_workflow_runner')

class ConstructionDemolitionPackageProofTest < Minitest::Test
  PackageObject = Struct.new(
    :id, :type, :owner_module, :entity, :created_phase, :removed_phase,
    :source_state, :relationships, :display_name, :updated_at,
    keyword_init: true
  )

  class PackageObjects
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
      raise KeyError, 'package object not found' unless object
      @clear_calls << [object.id, flags.map(&:to_s)]
      object
    end
  end

  class PackagePlanScenes
    attr_reader :refreshes

    def initialize
      @refreshes = []
    end

    def refresh_preset(preset_id, object_ids:)
      record = {
        'preset_id' => preset_id.to_s,
        'scene_name' => "Scene #{preset_id}",
        'object_ids' => Array(object_ids).map(&:to_s).sort
      }
      @refreshes << record
      {
        'scene_name' => record['scene_name'],
        'rendered_count' => record['object_ids'].length,
        'rendered_object_ids' => record['object_ids']
      }
    end
  end

  class PackageIssueSets
    attr_reader :last_issue_set

    def build(issue_set)
      @last_issue_set = issue_set
      {
        'id' => issue_set.id,
        'preset_ids' => issue_set.sheets.map(&:preset_id)
      }
    end
  end

  class PackageRuntime
    attr_reader :smart_objects, :project, :plan_scenes, :drawing_issue_sets, :planned_options

    def initialize(objects)
      @smart_objects = PackageObjects.new(objects)
      @project = Struct.new(:project_id).new('project-1')
      @plan_scenes = PackagePlanScenes.new
      @drawing_issue_sets = PackageIssueSets.new
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

  def object(id:, type:, owner:, entity: FakeEntity.new, phase: 'new_construction',
             relationships: [], display_name: nil)
    PackageObject.new(
      id: id,
      type: type,
      owner_module: owner,
      entity: entity,
      created_phase: phase,
      removed_phase: nil,
      source_state: 'confirmed',
      relationships: relationships,
      display_name: display_name || id,
      updated_at: '2026-09-11T00:00:00Z'
    )
  end

  def generated_from(extension_id)
    { 'kind' => 'generated_from', 'target_id' => extension_id, 'role' => 'extension_source' }
  end

  def test_workflow_refreshes_settles_and_currentness_checks_a100_and_a101_from_same_objects
    extension_entity = FakeEntity.new
    host_entity = FakeEntity.new
    opening_entity = FakeEntity.new

    extension = object(
      id: 'ext-1', type: 'extension.zone', owner: 'constructflow.extension',
      entity: extension_entity, display_name: 'Kitchen Extension'
    )
    host = object(
      id: 'wall-existing', type: 'architecture.wall', owner: 'constructflow.architecture',
      entity: host_entity, phase: 'existing'
    )
    opening = object(
      id: 'opening-1', type: 'opening.rectangular', owner: 'constructflow.opening',
      entity: opening_entity,
      relationships: [
        generated_from('ext-1'),
        { 'kind' => 'host', 'target_id' => 'wall-existing', 'role' => 'modifies_existing_host' }
      ]
    )

    JiraNot::ConstructFlow::Extension::Repository.new.write(
      extension_entity,
      JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
        boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]],
        program: 'kitchen', mode: 'construction', target_height_mm: 2800
      )
    )
    JiraNot::ConstructFlow::Architecture::WallRepository.new.write(
      host_entity,
      JiraNot::ConstructFlow::Architecture::WallDefinition.new(
        path_mm: [[0, 0, 0], [4000, 0, 0]], height_mm: 2800
      )
    )
    JiraNot::ConstructFlow::Opening::OpeningRepository.new.write(
      opening_entity,
      JiraNot::ConstructFlow::Opening::OpeningDefinition.new(
        host_object_id: 'wall-existing', segment_index: 0, start_offset_mm: 1200,
        width_mm: 900, height_mm: 2100, sill_mm: 0
      )
    )

    runtime = PackageRuntime.new([extension, host, opening])
    result = JiraNot::ConstructFlow::Extension::ConstructionWorkflowRunner.new(runtime: runtime).run(
      extension_id: 'ext-1',
      strict: false,
      refresh_drawings: true,
      revision: 'P01',
      issue_status: 'working'
    )

    assert_equal 'ready', result['status']
    assert_equal %w[architecture.demolition architecture.construction], result.dig('issue_set', 'preset_ids')
    assert_equal %w[architecture.demolition architecture.construction], runtime.plan_scenes.refreshes.map { |entry| entry['preset_id'] }

    demolition = result['drawing_refresh'].find { |entry| entry['preset_id'] == 'architecture.demolition' }
    proposed = result['drawing_refresh'].find { |entry| entry['preset_id'] == 'architecture.construction' }
    assert_equal %w[opening-1 wall-existing], demolition['source_object_ids']
    assert_equal demolition['source_object_ids'], demolition['rendered_object_ids']
    assert_equal demolition['source_object_ids'], proposed['source_object_ids']
    assert_equal proposed['source_object_ids'], proposed['rendered_object_ids']

    assert result.dig('output_settlement', 'publishable')
    assert result.dig('output_settlement', 'drawing', 'complete')
    assert_equal %w[architecture.construction architecture.demolition], result.dig('output_settlement', 'drawing', 'expected_preset_ids')
    assert_equal 'current', result.dig('currentness', 'status')
    assert result.dig('currentness', 'publishable')
    assert_equal 2, result.dig('currentness', 'drawing_checks').length
    assert result.dig('currentness', 'drawing_checks').all? { |entry| entry['scope_match'] }

    demolition_total = result.dig('takeoff', 'totals').find do |item|
      item['classification'] == 'opening.wall.removed_area'
    end
    refute_nil demolition_total
    assert_equal 'demolition', demolition_total['phase_scope']
    assert_in_delta 1.89, demolition_total['value'], 0.0001

    refute_nil result['output_state']
    assert_nil result['issue_history_entry']
  end
end
