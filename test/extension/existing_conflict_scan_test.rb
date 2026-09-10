# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/existing_conflict_scan')

ExistingConflictObject = Struct.new(
  :id, :type, :owner_module, :entity, :created_phase, :removed_phase, :relationships,
  keyword_init: true
)

class ExistingConflictObjects
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

class ExistingConflictScanTest < Minitest::Test
  def object(id:, type:, owner:, phase: JiraNot::ConstructFlow::Core::Phase::EXISTING,
             removed_phase: nil, relationships: [])
    ExistingConflictObject.new(
      id: id,
      type: type,
      owner_module: owner,
      entity: FakeEntity.new,
      created_phase: phase,
      removed_phase: removed_phase,
      relationships: relationships
    )
  end

  def extension
    source = object(
      id: 'ext-1',
      type: 'extension.zone',
      owner: 'constructflow.extension',
      phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION
    )
    JiraNot::ConstructFlow::Extension::Repository.new.write(
      source.entity,
      JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
        boundary_mm: [[0, 0, 0], [6000, 0, 0], [6000, 4000, 0], [0, 4000, 0]],
        program: 'kitchen',
        mode: 'construction'
      )
    )
    source
  end

  def runtime(objects)
    Struct.new(:smart_objects).new(ExistingConflictObjects.new(objects))
  end

  def test_detects_existing_column_manhole_foundation_and_crossing_pipe
    source = extension
    column = object(id: 'col-1', type: 'structure.column', owner: 'constructflow.structure')
    JiraNot::ConstructFlow::Structure::Repository.new.write_column(
      column.entity,
      JiraNot::ConstructFlow::Structure::ColumnDefinition.new(
        location_mm: [1000, 1000, 0],
        section_mm: [200, 200],
        base_elevation_mm: 0,
        top_elevation_mm: 3000
      )
    )

    foundation = object(id: 'fdn-1', type: 'structure.foundation', owner: 'constructflow.structure')
    JiraNot::ConstructFlow::Structure::Repository.new.write_foundation(
      foundation.entity,
      JiraNot::ConstructFlow::Structure::FoundationDefinition.new(
        center_mm: [5900, 2000, 0],
        size_mm: [800, 800, 300],
        top_elevation_mm: 0
      )
    )

    manhole = object(id: 'mh-1', type: 'drainage.manhole', owner: 'constructflow.drainage')
    JiraNot::ConstructFlow::Drainage::Repository.new.write_manhole(
      manhole.entity,
      JiraNot::ConstructFlow::Drainage::ManholeDefinition.new(
        location_mm: [3000, 2000, 0], size_mm: [600, 600]
      )
    )

    pipe = object(id: 'pipe-1', type: 'drainage.pipe_route', owner: 'constructflow.drainage')
    JiraNot::ConstructFlow::Drainage::Repository.new.write_pipe_route(
      pipe.entity,
      JiraNot::ConstructFlow::Drainage::PipeRouteDefinition.new(
        system: 'waste',
        route_nodes_mm: [[-1000, 2000, -300], [7000, 2000, -340]],
        start_connector_id: 'a',
        end_connector_id: 'b'
      )
    )

    result = JiraNot::ConstructFlow::Extension::ExistingConflictScan.new(
      runtime: runtime([source, column, foundation, manhole, pipe])
    ).run(extension_id: 'ext-1')

    assert_equal 'conflict', result['status']
    assert_equal 4, result['conflict_count']
    assert_equal %w[pipe-1 mh-1 col-1 fdn-1].sort, result['conflicts'].map { |item| item['object_id'] }.sort
    assert result['conflicts'].all? { |item| item['state'] == 'unresolved' }
  end

  def test_ignores_outside_demolished_and_new_construction_objects
    source = extension

    outside = object(id: 'outside', type: 'structure.column', owner: 'constructflow.structure')
    JiraNot::ConstructFlow::Structure::Repository.new.write_column(
      outside.entity,
      JiraNot::ConstructFlow::Structure::ColumnDefinition.new(
        location_mm: [10_000, 10_000, 0], base_elevation_mm: 0, top_elevation_mm: 3000
      )
    )

    demolished = object(
      id: 'demolished', type: 'drainage.manhole', owner: 'constructflow.drainage',
      removed_phase: JiraNot::ConstructFlow::Core::Phase::DEMOLITION
    )
    JiraNot::ConstructFlow::Drainage::Repository.new.write_manhole(
      demolished.entity,
      JiraNot::ConstructFlow::Drainage::ManholeDefinition.new(location_mm: [2000, 2000, 0])
    )

    new_work = object(
      id: 'new-work', type: 'structure.column', owner: 'constructflow.structure',
      phase: JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION
    )
    JiraNot::ConstructFlow::Structure::Repository.new.write_column(
      new_work.entity,
      JiraNot::ConstructFlow::Structure::ColumnDefinition.new(
        location_mm: [2000, 2000, 0], base_elevation_mm: 0, top_elevation_mm: 3000
      )
    )

    result = JiraNot::ConstructFlow::Extension::ExistingConflictScan.new(
      runtime: runtime([source, outside, demolished, new_work])
    ).run(extension_id: 'ext-1')

    assert_equal 'clear', result['status']
    assert_equal 0, result['conflict_count']
    assert_empty result['conflicts']
  end

  def test_missing_semantic_definition_is_visible_review_failure
    source = extension
    unknown = object(id: 'mh-missing', type: 'drainage.manhole', owner: 'constructflow.drainage')

    result = JiraNot::ConstructFlow::Extension::ExistingConflictScan.new(
      runtime: runtime([source, unknown])
    ).run(extension_id: 'ext-1')

    assert_equal 'conflict', result['status']
    conflict = result['conflicts'].first
    assert_equal 'extension.existing_conflict.definition_missing', conflict['rule_id']
    assert_equal 'definition_missing', conflict['conflict_kind']
  end
end
