require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/column_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/foundation_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/repository'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/grid_geometry'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/beam_geometry'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/geometry'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/coordination_capability'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/validators/structure_validator'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/quantity/structure_quantity_provider'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/registration'

class PlanEditorSyncTest < Minitest::Test
  def setup
    @model = FakeModel.new
    @runtime = build_test_runtime(@model)
    JiraNot::ConstructFlow::Structure::Registration.install(@runtime)
  end

  def test_create_column_preserves_external_uuid_and_human_mark
    col_uuid = '550e8400-e29b-41d4-a716-446655440000'
    input = {
      id: col_uuid,
      mark: 'C01',
      location_mm: [4000, 4000, 0],
      section_mm: [200, 200],
      height_mm: 3000
    }

    result = @runtime.commands.execute('CreateColumn', input, project_id: 'test-proj')
    assert_equal 'success', result[:status], "Command failed with: #{result[:error]}"

    column = @runtime.smart_objects.fetch_by_id(col_uuid)
    refute_nil column, 'Column must be fetchable by external UUID'
    assert_equal col_uuid, column.id
    assert_equal 'Column C01', column.display_name

    # Verify AttributeStore on the SketchUp entity
    store = JiraNot::ConstructFlow::Core::AttributeStore.new(column.entity)
    assert_equal col_uuid, store.read('object_id')
    assert_equal 'structure.column', store.read('object_type')

    # Verify domain definition
    repo = JiraNot::ConstructFlow::Structure::Repository.new
    col_def = repo.read_column(column.entity)
    assert_equal [4000.0, 4000.0, 0.0], col_def.location_mm
    assert_equal [200.0, 200.0], col_def.section_mm
  end

  def test_create_foundation_hosted_on_column_inherits_position_and_wires_relationships
    col_uuid = 'col-uuid-1234'
    fnd_uuid = 'fnd-uuid-5678'

    # 1. Create Column
    @runtime.commands.execute('CreateColumn', {
      id: col_uuid,
      mark: 'C01',
      location_mm: [4000, 4000, 0],
      section_mm: [200, 200]
    }, project_id: 'test-proj')

    # 2. Create Foundation hosted on this column
    fnd_result = @runtime.commands.execute('CreateFoundation', {
      id: fnd_uuid,
      mark: 'F01',
      supported_column_id: col_uuid,
      size_mm: [800, 800, 300]
    }, project_id: 'test-proj')
    assert_equal 'success', fnd_result[:status], "CreateFoundation failed: #{fnd_result[:error]}"

    foundation = @runtime.smart_objects.fetch_by_id(fnd_uuid)
    refute_nil foundation, 'Foundation must be fetchable by external UUID'
    assert_equal fnd_uuid, foundation.id
    assert_equal 'Footing F01', foundation.display_name

    # Check location centered at column
    repo = JiraNot::ConstructFlow::Structure::Repository.new
    fnd_def = repo.read_foundation(foundation.entity)
    assert_equal [4000.0, 4000.0, 0.0], fnd_def.center_mm
    assert_equal [800.0, 800.0, 300.0], fnd_def.size_mm

    # Verify relationships
    column = @runtime.smart_objects.fetch_by_id(col_uuid)
    fnd_rel = foundation.relationships.find { |r| (r['kind'] || r[:kind]) == 'supports' }
    refute_nil fnd_rel, 'Foundation must have supports relationship'
    assert_equal col_uuid, (fnd_rel['target_id'] || fnd_rel[:target_id])

    col_rel = column.relationships.find { |r| (r['kind'] || r[:kind]) == 'supported_by' }
    refute_nil col_rel, 'Column must have supported_by relationship'
    assert_equal fnd_uuid, (col_rel['target_id'] || col_rel[:target_id])
  end

  def test_move_column_updates_column_and_hosted_foundation_preserving_uuids
    col_uuid = 'col-move-test-1'
    fnd_uuid = 'fnd-move-test-1'

    @runtime.commands.execute('CreateColumn', {
      id: col_uuid,
      mark: 'C01',
      location_mm: [0, 0, 0],
      section_mm: [200, 200]
    }, project_id: 'test-proj')

    @runtime.commands.execute('CreateFoundation', {
      id: fnd_uuid,
      mark: 'F01',
      supported_column_id: col_uuid,
      size_mm: [800, 800, 300]
    }, project_id: 'test-proj')

    # Execute MoveColumn semantic command
    move_result = @runtime.commands.execute('MoveColumn', {
      object_id: col_uuid,
      location_mm: [6000, 8000, 0]
    }, project_id: 'test-proj')
    assert_equal 'success', move_result[:status], "MoveColumn failed: #{move_result[:error]}"

    # Verify Column moved, UUID untouched
    column = @runtime.smart_objects.fetch_by_id(col_uuid)
    refute_nil column
    assert_equal col_uuid, column.id
    repo = JiraNot::ConstructFlow::Structure::Repository.new
    updated_col_def = repo.read_column(column.entity)
    assert_equal [6000.0, 8000.0, 0.0], updated_col_def.location_mm

    # Verify hosted Foundation moved with column, UUID untouched
    foundation = @runtime.smart_objects.fetch_by_id(fnd_uuid)
    refute_nil foundation
    assert_equal fnd_uuid, foundation.id
    updated_fnd_def = repo.read_foundation(foundation.entity)
    assert_equal [6000.0, 8000.0, 0.0], updated_fnd_def.center_mm
  end

  def test_update_column_mark_renames_without_changing_uuid
    col_uuid = 'col-rename-uuid'
    @runtime.commands.execute('CreateColumn', {
      id: col_uuid,
      mark: 'C01',
      location_mm: [2000, 2000, 0],
      section_mm: [200, 200]
    }, project_id: 'test-proj')

    rename_result = @runtime.commands.execute('UpdateColumnMark', {
      object_id: col_uuid,
      mark: 'C99'
    }, project_id: 'test-proj')
    assert_equal 'success', rename_result[:status]

    column = @runtime.smart_objects.fetch_by_id(col_uuid)
    assert_equal col_uuid, column.id
    assert_equal 'Column C99', column.display_name

    store = JiraNot::ConstructFlow::Core::AttributeStore.new(column.entity)
    assert_equal col_uuid, store.read('object_id')
    assert_equal 'C99', store.read('mark')
  end

  def test_update_foundation_mark_renames_without_changing_uuid
    fnd_uuid = 'fnd-rename-uuid'
    @runtime.commands.execute('CreateFoundation', {
      id: fnd_uuid,
      mark: 'F1',
      location_mm: [2000, 2000, 0],
      size_mm: [800, 800, 300]
    }, project_id: 'test-proj')

    rename_result = @runtime.commands.execute('UpdateFoundationMark', {
      object_id: fnd_uuid,
      mark: 'F2'
    }, project_id: 'test-proj')
    assert_equal 'success', rename_result[:status]

    foundation = @runtime.smart_objects.fetch_by_id(fnd_uuid)
    assert_equal fnd_uuid, foundation.id
    assert_equal 'Footing F2', foundation.display_name

    store = JiraNot::ConstructFlow::Core::AttributeStore.new(foundation.entity)
    assert_equal fnd_uuid, store.read('object_id')
    assert_equal 'F2', store.read('mark')
  end

  def test_create_isolated_spread_footing_without_column
    isolated_uuid = 'fnd-isolated-123'
    result = @runtime.commands.execute('CreateFoundation', {
      id: isolated_uuid,
      mark: 'F1',
      location_mm: [5000, 3000, 0],
      size_mm: [1000, 1000, 400]
    }, project_id: 'test-proj')
    assert_equal 'success', result[:status]

    fnd = @runtime.smart_objects.fetch_by_id(isolated_uuid)
    refute_nil fnd
    assert_equal isolated_uuid, fnd.id
    assert_equal 'Footing F1', fnd.display_name

    repo = JiraNot::ConstructFlow::Structure::Repository.new
    def_data = repo.read_foundation(fnd.entity)
    assert_equal [5000.0, 3000.0, 0.0], def_data.center_mm
    assert_equal [1000.0, 1000.0, 400.0], def_data.size_mm
  end

  def test_vertical_slice_01_batch_sync_9_columns_and_9_footings_schedule_types
    # 3x3 grid: x in [0, 4000, 8000], y in [0, 4000, 8000]
    grid_coords = [
      [0, 0], [4000, 0], [8000, 0],
      [0, 4000], [4000, 4000], [8000, 4000],
      [0, 8000], [4000, 8000], [8000, 8000]
    ]

    col_uuids = []
    fnd_uuids = []

    grid_coords.each_with_index do |(x, y), idx|
      c_id = "0199f420-col-0000-0000-#{idx.to_s.rjust(12, '0')}"
      f_id = "0199f420-fnd-0000-0000-#{idx.to_s.rjust(12, '0')}"
      col_uuids << c_id
      fnd_uuids << f_id

      # All 9 initial columns share engineering schedule Type Mark 'C1'
      col_res = @runtime.commands.execute('CreateColumn', {
        id: c_id,
        mark: 'C1',
        location_mm: [x, y, 0],
        section_mm: [200, 200],
        height_mm: 3000
      }, project_id: 'test-proj')
      assert_equal 'success', col_res[:status]

      # All 9 initial footings share engineering schedule Type Mark 'F1'
      fnd_res = @runtime.commands.execute('CreateFoundation', {
        id: f_id,
        mark: 'F1',
        supported_column_id: c_id,
        size_mm: [800, 800, 300]
      }, project_id: 'test-proj')
      assert_equal 'success', fnd_res[:status]
    end

    assert_equal 18, @runtime.smart_objects.size
    col_uuids.each do |c_id|
      obj = @runtime.smart_objects.fetch_by_id(c_id)
      refute_nil obj
      assert_equal 'structure.column', obj.type
      assert_equal 'Column C1', obj.display_name
    end
    fnd_uuids.each do |f_id|
      obj = @runtime.smart_objects.fetch_by_id(f_id)
      refute_nil obj
      assert_equal 'structure.foundation', obj.type
      assert_equal 'Footing F1', obj.display_name
    end
  end

  def test_update_structural_type_dimensions_cascades_to_all_matching_columns
    col1_id = 'c-batch-1'
    col2_id = 'c-batch-2'

    @runtime.commands.execute('CreateColumn', {
      id: col1_id,
      mark: 'C1',
      location_mm: [0, 0, 0],
      section_mm: [200, 200]
    }, project_id: 'test-proj')

    @runtime.commands.execute('CreateColumn', {
      id: col2_id,
      mark: 'C1',
      location_mm: [4000, 0, 0],
      section_mm: [200, 200]
    }, project_id: 'test-proj')

    # Execute UpdateStructuralTypeDimensions
    res = @runtime.commands.execute('UpdateStructuralTypeDimensions', {
      type_id_or_name: 'C1',
      section_mm: [350, 350]
    }, project_id: 'test-proj')
    assert_equal 'success', res[:status]

    repo = JiraNot::ConstructFlow::Structure::Repository.new
    col1 = @runtime.smart_objects.fetch_by_id(col1_id)
    col2 = @runtime.smart_objects.fetch_by_id(col2_id)

    assert_equal [350.0, 350.0], repo.read_column(col1.entity).section_mm
    assert_equal [350.0, 350.0], repo.read_column(col2.entity).section_mm
  end

  def test_create_beam_preserves_external_uuid_and_human_mark
    beam_uuid = 'beam-sync-test-uuid'
    input = {
      id: beam_uuid,
      mark: 'B1',
      path_mm: [[0, 0, 0], [4000, 0, 0]],
      section_mm: [200, 400],
      material: 'reinforced_concrete'
    }

    result = @runtime.commands.execute('CreateBeam', input, project_id: 'test-proj')
    assert_equal 'success', result[:status], "CreateBeam failed: #{result[:error]}"

    beam = @runtime.smart_objects.fetch_by_id(beam_uuid)
    refute_nil beam, 'Beam must be fetchable by external UUID'
    assert_equal beam_uuid, beam.id
    assert_equal 'Beam B1', beam.display_name

    store = JiraNot::ConstructFlow::Core::AttributeStore.new(beam.entity)
    assert_equal beam_uuid, store.read('object_id')
    assert_equal 'structure.beam', store.read('object_type')
    assert_equal 'B1', store.read('mark')

    repo = JiraNot::ConstructFlow::Structure::Repository.new
    beam_def = repo.read_beam(beam.entity)
    assert_equal [[0.0, 0.0, 0.0], [4000.0, 0.0, 0.0]], beam_def.path_mm
    assert_equal [200.0, 400.0], beam_def.section_mm
  end

  def test_update_beam_mark_renames_without_changing_uuid
    beam_uuid = 'beam-rename-uuid'
    @runtime.commands.execute('CreateBeam', {
      id: beam_uuid,
      mark: 'B1',
      path_mm: [[0, 0, 0], [4000, 0, 0]],
      section_mm: [200, 400]
    }, project_id: 'test-proj')

    rename_result = @runtime.commands.execute('UpdateBeamMark', {
      object_id: beam_uuid,
      mark: 'B2'
    }, project_id: 'test-proj')
    assert_equal 'success', rename_result[:status]

    beam = @runtime.smart_objects.fetch_by_id(beam_uuid)
    assert_equal beam_uuid, beam.id
    assert_equal 'Beam B2', beam.display_name

    store = JiraNot::ConstructFlow::Core::AttributeStore.new(beam.entity)
    assert_equal beam_uuid, store.read('object_id')
    assert_equal 'B2', store.read('mark')
  end

  def test_update_structural_type_dimensions_cascades_to_all_matching_beams
    beam1_id = 'b-batch-1'
    beam2_id = 'b-batch-2'

    @runtime.commands.execute('CreateBeam', {
      id: beam1_id,
      mark: 'B1',
      path_mm: [[0, 0, 0], [4000, 0, 0]],
      section_mm: [200, 400]
    }, project_id: 'test-proj')

    @runtime.commands.execute('CreateBeam', {
      id: beam2_id,
      mark: 'B1',
      path_mm: [[0, 4000, 0], [4000, 4000, 0]],
      section_mm: [200, 400]
    }, project_id: 'test-proj')

    res = @runtime.commands.execute('UpdateStructuralTypeDimensions', {
      type_id_or_name: 'B1',
      section_mm: [250, 500]
    }, project_id: 'test-proj')
    assert_equal 'success', res[:status]

    repo = JiraNot::ConstructFlow::Structure::Repository.new
    beam1 = @runtime.smart_objects.fetch_by_id(beam1_id)
    beam2 = @runtime.smart_objects.fetch_by_id(beam2_id)

    assert_equal [250.0, 500.0], repo.read_beam(beam1.entity).section_mm
    assert_equal [250.0, 500.0], repo.read_beam(beam2.entity).section_mm
  end
end
