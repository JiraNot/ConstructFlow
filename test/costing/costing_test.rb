# frozen_string_literal: true

require_relative '../test_helper'

class CostingTest < Minitest::Test
  Costing = JiraNot::ConstructFlow::Costing

  def setup
    @runtime = build_test_runtime
    Costing::Registration.install(@runtime)

    @rate_conc = Costing::RateItem.new(
      classification: 'structure.column.concrete',
      description: 'Reinforced Concrete 240 ksc',
      unit: 'm3',
      material_rate: 2200.0,
      labor_rate: 450.0,
      equipment_rate: 150.0,
      default_waste_pct: 5.0,
      currency: 'THB'
    )

    @rate_brick = Costing::RateItem.new(
      classification: 'architecture.wall.masonry',
      description: 'Red Clay Brick Wall 10cm',
      unit: 'm2',
      material_rate: 350.0,
      labor_rate: 180.0,
      equipment_rate: 0.0,
      default_waste_pct: 7.0,
      currency: 'THB'
    )

    @library = Costing::RateLibrary.new(
      id: 'lib_th_standard_2026',
      name: 'Standard Construction Rates 2026',
      version: '1.0',
      currency: 'THB',
      items: {
        @rate_conc.classification => @rate_conc,
        @rate_brick.classification => @rate_brick
      }
    )
  end

  def test_rate_item_validity_and_calculations
    assert @rate_conc.valid?
    assert_empty @rate_conc.errors
    assert_equal 2800.0, @rate_conc.unit_rate
    assert_equal 'm3', @rate_conc.unit
    assert_equal 'THB', @rate_conc.currency

    # Negative rate test
    invalid = Costing::RateItem.new(
      classification: 'invalid',
      description: 'Invalid item',
      unit: 'm2',
      material_rate: -10.0
    )
    refute invalid.valid?
    assert_includes invalid.errors.first, 'material rate cannot be negative'

    # Unsupported unit test
    invalid_unit = Costing::RateItem.new(
      classification: 'invalid',
      description: 'Invalid item',
      unit: 'gallons',
      material_rate: 10.0
    )
    refute invalid_unit.valid?
    assert_includes invalid_unit.errors.join, 'unsupported unit'
  end

  def test_rate_item_serialization_round_trip
    hash = @rate_conc.to_h
    restored = Costing::RateItem.from_h(hash)

    assert_equal @rate_conc.classification, restored.classification
    assert_equal @rate_conc.unit_rate, restored.unit_rate
    assert_equal @rate_conc.default_waste_pct, restored.default_waste_pct
  end

  def test_rate_library_lookups_and_immutability
    assert @library.valid?
    found = @library.find_rate('structure.column.concrete')
    assert found
    assert_equal 2200.0, found.material_rate

    # Adding a new rate item returns a new library instance
    tile_rate = Costing::RateItem.new(
      classification: 'surface.paving.tile',
      description: 'Porcelain Tile 60x60',
      unit: 'm2',
      material_rate: 450.0,
      labor_rate: 200.0,
      default_waste_pct: 10.0
    )
    updated_lib = @library.add_or_update_item(tile_rate)
    refute_same @library, updated_lib
    assert_equal 3, updated_lib.items.size
    assert updated_lib.find_rate('surface.paving.tile')
    assert_nil @library.find_rate('surface.paving.tile')
  end

  def test_cost_estimate_line_calculations
    line = Costing::CostEstimateLine.new(
      line_id: 'line_001',
      classification: 'structure.column.concrete',
      description: 'Column concrete',
      phase_scope: 'new_construction',
      unit: 'm3',
      net_quantity: 10.0,
      waste_pct: 5.0,
      material_rate: 2000.0,
      labor_rate: 500.0,
      equipment_rate: 100.0
    )

    assert_equal 0.5, line.waste_quantity
    assert_equal 10.5, line.gross_quantity
    assert_equal 2600.0, line.unit_rate
    assert_equal 21000.0, line.subtotal_material # 10.5 * 2000
    assert_equal 5250.0, line.subtotal_labor     # 10.5 * 500
    assert_equal 1050.0, line.subtotal_equipment # 10.5 * 100
    assert_equal 27300.0, line.total_cost        # 10.5 * 2600
    assert_equal '03_concrete_structure', line.trade_division
  end

  def test_costing_engine_generates_estimate_from_quantities
    engine = Costing::CostingEngine.new

    quantity_items = [
      {
        id: 'qty_01',
        classification: 'structure.column.concrete',
        description: 'RC Columns C1',
        unit: 'm3',
        value: 12.0,
        phase_scope: 'new_construction',
        source_object_id: 'col_101',
        source_module: 'structure',
        formula_version: 1
      },
      {
        id: 'qty_02',
        classification: 'architecture.wall.masonry',
        description: 'Partition walls',
        unit: 'm2',
        value: 50.0,
        phase_scope: 'new_construction',
        source_object_id: 'wall_201',
        source_module: 'architecture',
        formula_version: 1,
        # Override default waste with nested breakdown waste
        breakdown: { 'waste_pct' => 12.0 }
      }
    ]

    estimate = engine.generate(
      quantity_items: quantity_items,
      rate_library: @library,
      estimate_id: 'est_demo_01'
    )

    assert_equal 'est_demo_01', estimate.estimate_id
    assert_equal 2, estimate.line_count
    assert_equal 'THB', estimate.currency

    col_line = estimate.lines.first
    assert_equal 'structure.column.concrete', col_line.classification
    assert_equal 5.0, col_line.waste_pct # from rate library default

    wall_line = estimate.lines.last
    assert_equal 'architecture.wall.masonry', wall_line.classification
    assert_equal 12.0, wall_line.waste_pct # overridden from breakdown

    assert_operator estimate.total_cost, :>, 0
    assert_operator estimate.total_material_cost, :>, 0
    assert_operator estimate.total_labor_cost, :>, 0

    # Test division summaries
    div_summaries = estimate.division_summaries
    assert div_summaries.key?('03_concrete_structure')
    assert div_summaries.key?('04_masonry')
  end

  def test_estimate_snapshot_and_repository_round_trip
    repo = Costing::Repository.new(@runtime.active_model)
    engine = Costing::CostingEngine.new

    repo.write_rate_library(@runtime.active_model, @library)
    read_lib = repo.read_rate_library(@runtime.active_model, @library.id)
    assert read_lib
    assert_equal @library.id, read_lib.id
    assert_equal 2, read_lib.items.size

    estimate = engine.generate(
      quantity_items: [
        {
          id: 'q1',
          classification: 'structure.column.concrete',
          unit: 'm3',
          value: 5.0
        }
      ],
      rate_library: @library,
      estimate_id: 'est_001'
    )

    repo.write_estimate(@runtime.active_model, estimate)
    read_est = repo.read_estimate(@runtime.active_model, 'est_001')
    assert read_est
    assert_equal 1, read_est.line_count
    assert_equal estimate.total_cost, read_est.total_cost

    snapshot = Costing::EstimateSnapshot.new(
      snapshot_id: 'snap_v1',
      estimate_id: read_est.estimate_id,
      rate_library_id: read_est.rate_library_id,
      rate_library_version: read_est.rate_library_version,
      project_revision: 1,
      total_cost: read_est.total_cost,
      currency: read_est.currency,
      estimate_payload: read_est.to_h
    )

    repo.write_snapshot(@runtime.active_model, snapshot)
    read_snap = repo.read_snapshot(@runtime.active_model, 'snap_v1')
    assert read_snap
    assert_equal 1, read_snap.project_revision
    assert_equal snapshot.total_cost, read_snap.total_cost
  end

  def test_boq_exporter_csv
    engine = Costing::CostingEngine.new
    estimate = engine.generate(
      quantity_items: [
        {
          id: 'q1',
          classification: 'structure.column.concrete',
          description: 'C1 Column',
          unit: 'm3',
          value: 10.0,
          source_object_id: 'col_1'
        }
      ],
      rate_library: @library,
      estimate_id: 'est_csv'
    )

    exporter = Costing::BoqExporter.new
    result = exporter.export(estimate)

    assert_equal 'est_csv', result[:estimate_id]
    assert_equal estimate.total_cost, result[:total_cost]
    assert_includes result[:csv], 'Line ID,Phase Scope,Division,Classification'
    assert_includes result[:csv], 'structure.column.concrete'
    assert_includes result[:csv], 'col_1'
  end

  def test_costing_commands_end_to_end
    # 1. CreateRateLibrary
    res1 = @runtime.commands.execute(
      'CreateRateLibrary',
      {
        id: 'lib_test_cmd',
        name: 'Command Test Library',
        version: '1.0',
        currency: 'THB'
      }
    )
    assert_equal 'success', res1[:status], res1[:errors]&.join(', ')
    evt1 = res1[:events].find { |e| e[:name] == 'RateLibraryCreated' }
    assert evt1
    assert_equal 'lib_test_cmd', evt1[:payload][:id]

    # 2. UpdateRateItem
    res2 = @runtime.commands.execute(
      'UpdateRateItem',
      {
        library_id: 'lib_test_cmd',
        classification: 'structure.column.concrete',
        description: 'RC Concrete 240 ksc',
        unit: 'm3',
        material_rate: 2000.0,
        labor_rate: 500.0,
        equipment_rate: 100.0,
        default_waste_pct: 5.0
      }
    )
    assert_equal 'success', res2[:status], res2[:errors]&.join(', ')
    evt2 = res2[:events].find { |e| e[:name] == 'RateItemUpdated' }
    assert evt2
    assert_equal 2600.0, evt2[:payload][:unit_rate]

    # 3. GenerateCostEstimate
    res3 = @runtime.commands.execute(
      'GenerateCostEstimate',
      {
        rate_library_id: 'lib_test_cmd',
        estimate_id: 'est_cmd_01',
        quantity_items: [
          {
            id: 'qty_cmd_01',
            classification: 'structure.column.concrete',
            description: 'Column',
            unit: 'm3',
            value: 10.0,
            phase_scope: 'new_construction'
          }
        ]
      }
    )
    assert_equal 'success', res3[:status], res3[:errors]&.join(', ')
    evt3 = res3[:events].find { |e| e[:name] == 'CostEstimateGenerated' }
    assert evt3
    assert_equal 27300.0, evt3[:payload]['total_cost']

    # 4. CreateEstimateSnapshot
    res4 = @runtime.commands.execute(
      'CreateEstimateSnapshot',
      {
        estimate_id: 'est_cmd_01',
        snapshot_id: 'snap_cmd_01',
        project_revision: 2
      }
    )
    assert_equal 'success', res4[:status], res4[:errors]&.join(', ')
    evt4 = res4[:events].find { |e| e[:name] == 'EstimateSnapshotted' }
    assert evt4
    assert_equal 'snap_cmd_01', evt4[:payload][:snapshot_id]
    assert_equal 27300.0, evt4[:payload][:total_cost]

    # 5. ExportBOQ
    res5 = @runtime.commands.execute(
      'ExportBOQ',
      {
        estimate_id: 'est_cmd_01'
      }
    )
    assert_equal 'success', res5[:status], res5[:errors]&.join(', ')
    evt5 = res5[:events].find { |e| e[:name] == 'BoqExported' }
    assert evt5
    assert_includes evt5[:payload][:csv], 'structure.column.concrete'
  end
end
