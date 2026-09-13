# frozen_string_literal: true

require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/core/costing/thai_cost_database'
require_relative '../../apps/sketchup-extension/constructflow/core/costing/boq_excel_exporter'
require_relative '../../apps/sketchup-extension/constructflow/core/layout/thai_a3_drawing_sheet_service'

class ThaiCostingAndLayoutTest < Minitest::Test
  CostDB = JiraNot::ConstructFlow::Costing::ThaiCostDatabase
  Exporter = JiraNot::ConstructFlow::Costing::BoqExcelExporter
  LayoutService = JiraNot::ConstructFlow::Layout::ThaiA3DrawingSheetService

  def test_thai_cost_database_rates_and_calculation
    db = CostDB.new
    conc = db.rate_for(:concrete_ready_mix_240ksc)
    assert conc
    assert_equal 'CONC-240', conc[:code]
    assert_equal 2150.0, conc[:material_rate_thb]
    assert_equal 350.0, conc[:labor_rate_thb]

    # Calculate 10 m3 with 12% factor F
    line = db.calculate_line_total(:concrete_ready_mix_240ksc, 10.0, 0.12)
    assert_equal 21500.0, line[:material_total]
    assert_equal 3500.0, line[:labor_total]
    assert_equal 25000.0, line[:base_total]
    assert_equal 3000.0, line[:factor_amount] # 12% of 25,000
    assert_equal 28000.0, line[:grand_total]
  end

  def test_boq_excel_exporter_generates_bom_and_csv
    db = CostDB.new
    lines = [
      db.calculate_line_total(:concrete_ready_mix_240ksc, 12.0, 0.12),
      db.calculate_line_total(:metalsheet_snaplock_pu, 30.0, 0.12),
      db.calculate_line_total(:sliding_door_20x22, 1.0, 0.12)
    ]

    csv_out = Exporter.export_to_csv(lines, {
      project_name: 'งานต่อเติมครัวไทยและโรงจอดรถ',
      owner_name: 'คุณสมชาย มีสุข',
      factor_f: 0.12
    })

    assert csv_out.start_with?("\xEF\xBB\xBF") # UTF-8 BOM present
    assert_includes csv_out, 'ใบประมาณราคาค่าก่อสร้าง (BOQ - Bill of Quantities)'
    assert_includes csv_out, 'งานต่อเติมครัวไทยและโรงจอดรถ'
    assert_includes csv_out, 'CONC-240'
    assert_includes csv_out, 'ROOF-MS-PU'
    assert_includes csv_out, 'OPEN-DOOR-SL2'
    assert_includes csv_out, 'สรุปยอดรวมสุทธิ'
  end

  def test_thai_a3_drawing_sheet_service_manifest
    manifest = LayoutService.generate_sheet_manifest({
      project_name: 'บ้านพักอาศัย 2 ชั้น สุขุมวิท',
      owner_name: 'คุณวิชัย',
      designer: 'ConstructFlow Professional Team'
    })

    assert_equal '1.0.0', manifest[:version]
    assert_equal 6, manifest[:total_sheets]
    assert_equal 6, manifest[:sheets].length

    sheet_codes = manifest[:sheets].map { |s| s[:sheet_no] }
    assert_includes sheet_codes, 'A-101'
    assert_includes sheet_codes, 'S-101'
    assert_includes sheet_codes, 'A-102'
    assert_includes sheet_codes, 'A-201'
    assert_includes sheet_codes, 'A-301'
    assert_includes sheet_codes, 'A-001'

    manifest[:sheets].each do |s|
      assert_equal 'A3 Landscape (420 x 297 mm)', s[:paper_size]
      assert s[:linked_scene].start_with?('CF_')
      assert_equal 'บ้านพักอาศัย 2 ชั้น สุขุมวิท', s[:title_block][:project]
    end
  end
end
