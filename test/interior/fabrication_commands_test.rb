# frozen_string_literal: true

require_relative '../test_helper'

class FabricationCommandsTest < Minitest::Test
  def setup
    @runtime = build_test_runtime
    JiraNot::ConstructFlow::Interior::Registration.install(@runtime)
  end

  def test_fabrication_commands_flow_end_to_end
    # 1. Create cabinet
    create_res = @runtime.commands.execute(
      'CreateCabinetRun',
      {
        origin_mm: [0, 0, 0],
        width_mm: 1200,
        height_mm: 800,
        depth_mm: 600,
        module_count: 2,
        carcass_material_id: 'board.hmr.18'
      }
    )
    assert_equal 'success', create_res[:status], create_res[:errors].join(', ')
    cabinet_id = create_res[:created_object_ids].first

    # 2. Generate parts
    gen_res = @runtime.commands.execute(
      'GenerateJoineryParts',
      { object_id: cabinet_id }
    )
    assert_equal 'success', gen_res[:status], gen_res[:errors].join(', ')

    # 3. Generate Sheet Nesting
    nest_res = @runtime.commands.execute(
      'GenerateSheetNesting',
      {
        object_id: cabinet_id,
        saw_kerf_mm: 4.0,
        trim_margin_mm: 10.0
      }
    )
    assert_equal 'success', nest_res[:status], nest_res[:errors].join(', ')
    nest_evt = nest_res[:events].find { |e| e[:name] == 'SheetNestingGenerated' }
    assert nest_evt, 'SheetNestingGenerated event should be emitted'
    assert_operator nest_evt[:payload]['total_sheets'], :>=, 1
    assert_operator nest_evt[:payload]['overall_utilization_pct'], :>, 0.0

    # 4. Export Cut List
    cut_res = @runtime.commands.execute(
      'ExportCutList',
      { object_id: cabinet_id }
    )
    assert_equal 'success', cut_res[:status], cut_res[:errors].join(', ')
    cut_evt = cut_res[:events].find { |e| e[:name] == 'CutListExported' }
    assert cut_evt, 'CutListExported event should be emitted'
    assert_operator cut_evt[:payload][:rows].length, :>=, 4
    assert_operator cut_evt[:payload][:csv].length, :>, 50

    # 5. Generate CNC Operations
    cnc_res = @runtime.commands.execute(
      'GenerateCncOperations',
      { object_id: cabinet_id }
    )
    assert_equal 'success', cnc_res[:status], cnc_res[:errors].join(', ')
    cnc_evt = cnc_res[:events].find { |e| e[:name] == 'CncOperationsGenerated' }
    assert cnc_evt, 'CncOperationsGenerated event should be emitted'
    assert_operator cnc_evt[:payload][:total_operations], :>, 0
  end
end
