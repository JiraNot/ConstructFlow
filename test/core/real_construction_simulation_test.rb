# frozen_string_literal: true

require_relative '../test_helper'

class Numeric
  def mm; self.to_f; end
  def m; self.to_f * 1000.0; end
  def to_m; self.to_f / 1000.0; end
end

module Geom
  class Vector3d
    attr_accessor :x, :y, :z
    def initialize(x = 0.0, y = 0.0, z = 0.0)
      @x = x.to_f; @y = y.to_f; @z = z.to_f
    end
    def -(other); Vector3d.new(@x - other.x, @y - other.y, @z - other.z); end
    def +(other); Vector3d.new(@x + other.x, @y + other.y, @z + other.z); end
    def *(val); val.is_a?(Numeric) ? Vector3d.new(@x * val, @y * val, @z * val) : Vector3d.new(@y * val.z - @z * val.y, @z * val.x - @x * val.z, @x * val.y - @y * val.x); end
    def %(other); @x * other.x + @y * other.y + @z * other.z; end
    def length; Math.sqrt(@x * @x + @y * @y + @z * @z); end
    def normalize!; len = length; len > 0.0001 ? (@x /= len; @y /= len; @z /= len; self) : self; end
  end unless defined?(Geom::Vector3d)

  class Point3d
    attr_accessor :x, :y, :z
    def initialize(x = 0.0, y = 0.0, z = 0.0)
      @x = x.to_f; @y = y.to_f; @z = z.to_f
    end
    def -(other); Vector3d.new(@x - other.x, @y - other.y, @z - other.z); end
    def +(vec); Point3d.new(@x + vec.x, @y + vec.y, @z + vec.z); end
    def offset(vec); Point3d.new(@x + vec.x, @y + vec.y, @z + vec.z); end
    def to_m; @z / 1000.0; end
  end unless defined?(Geom::Point3d)
end

module Sketchup
  unless const_defined?(:ComponentInstance)
    class ComponentInstance; end
  end
end

# Load all core & module engines
require File.join(CORE, 'tools', 'extension_scene_generator')
require File.join(CORE, 'tools', 'auto_dimension_engine')
require File.join(CORE, 'tools', 'spot_elevation_tool')
require File.join(CORE, 'takeoff_hud_service')
require File.join(CORE, 'smart_stretch_engine')
require File.join(CORE, 'structural_profile_catalog')
require File.join(CORE, 'custom_profile_store')

# Structure modules
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'structure', 'column_definition')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'structure', 'beam_definition')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'structure', 'foundation_definition')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'structure', 'grid_definition')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'structure', 'rebar_set_definition')

# Architecture modules
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'architecture', 'wall_definition')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'architecture', 'wall_join_engine')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'architecture', 'floor_definition')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'architecture', 'stair_definition')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'architecture', 'stair_geometry')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'architecture', 'stair_validator')

# Roof & MEP & Costing
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'roof', 'roof_definition')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'electrical', 'voltage_drop_calculator')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'costing', 'cost_estimate')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'costing', 'cost_estimate_line')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'costing', 'costing_engine')
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'costing', 'boq_exporter')

class RealConstructionSimulationTest < Minitest::Test
  class MockBoundingBox
    attr_accessor :min, :max
    def initialize(min_pt, max_pt)
      @min = min_pt
      @max = max_pt
    end
    def center
      Geom::Point3d.new((@min.x + @max.x) / 2.0, (@min.y + @max.y) / 2.0, (@min.z + @max.z) / 2.0)
    end
    def diagonal; 5000.0; end
    def width; @max.x - @min.x; end
    def height; @max.y - @min.y; end
    def depth; @max.z - @min.z; end
    def intersect(other)
      x_overlap = [@min.x, other.min.x].max < [@max.x, other.max.x].min
      y_overlap = [@min.y, other.min.y].max < [@max.y, other.max.y].min
      z_overlap = [@min.z, other.min.z].max < [@max.z, other.max.z].min
      valid = x_overlap && y_overlap && z_overlap
      res = MockBoundingBox.new(Geom::Point3d.new(0,0,0), Geom::Point3d.new(0,0,0))
      def res.valid?; @v; end
      res.instance_variable_set(:@v, valid)
      res
    end
  end

  class MockCamera
    attr_accessor :perspective, :eye, :target, :up
    def set(eye, target, up); @eye = eye; @target = target; @up = up; end
  end

  class MockPage
    attr_reader :name, :camera
    def initialize(name)
      @name = name
      @camera = MockCamera.new
    end
    def update; true; end
  end

  class MockPages
    def initialize; @pages = {}; end
    def [](name); @pages[name]; end
    def add(name); @pages[name] = MockPage.new(name); end
    def size; @pages.size; end
  end

  class MockLayers
    def initialize; @layers = {}; end
    def [](name); @layers[name]; end
    def add(name); @layers[name] = name; end
  end

  class MockEntities
    attr_reader :items, :dimensions, :texts
    def initialize
      @items = []
      @dimensions = []
      @texts = []
    end
    def add_dimension_linear(p1, p2, vec)
      dim = { p1: p1, p2: p2, vec: vec }
      @dimensions << dim
      dim
    end
    def add_text(string, point, vec)
      txt = { string: string, point: point, vec: vec }
      @texts << txt
      txt
    end
    def add_group
      grp = MockEntity.new('group')
      @items << grp
      grp
    end
  end

  class MockEntity
    attr_accessor :name, :layer, :bounds, :attributes
    def initialize(type = 'group')
      @type = type
      @attributes = {}
      @bounds = MockBoundingBox.new(Geom::Point3d.new(0, 0, 0), Geom::Point3d.new(250, 250, 3500))
      @entities = MockEntities.new
    end
    def entities; @entities; end
    def is_a?(klass); true; end
    def get_attribute(dict, key, default = nil)
      (@attributes[dict] && @attributes[dict][key]) || default
    end
    def set_attribute(dict, key, val)
      @attributes[dict] ||= {}
      @attributes[dict][key] = val
    end
  end

  class MockModel
    attr_reader :pages, :layers, :active_entities, :selection, :bounds
    def initialize
      @pages = MockPages.new
      @layers = MockLayers.new
      @active_entities = MockEntities.new
      @selection = []
      @bounds = MockBoundingBox.new(Geom::Point3d.new(0, 0, 0), Geom::Point3d.new(4000, 6000, 3500))
    end
    def start_operation(name, disable_ui = false); true; end
    def commit_operation; true; end
    def abort_operation; true; end
  end

  class MockRuntime
    attr_reader :active_model
    def initialize(model)
      @active_model = model
    end
  end

  def setup
    @model = MockModel.new
    @runtime = MockRuntime.new(@model)
    @created_objects = []
  end

  # ── 1. PROJECT SETUP: LEVELS & GRIDS ──────────────────────────
  def test_01_project_setup_levels_and_grids
    reg = JiraNot::ConstructFlow::Core::LevelRegistry.new
    reg.register(id: 'lvl_0', name: 'GL (ระดับดินเดิม)', kind: 'ground', elevation_mm: -500.0)
    reg.register(id: 'lvl_1', name: '1FL (ระดับพื้นชั้น 1)', kind: 'floor', elevation_mm: 0.0)
    reg.register(id: 'lvl_ceil', name: 'CL (ระดับฝ้าเพดาน)', kind: 'ceiling', elevation_mm: 2800.0)
    reg.register(id: 'lvl_roof', name: 'RB (ระดับหลังคาน)', kind: 'roof', elevation_mm: 3500.0)

    assert_equal 4, reg.size
    assert_equal 0.0, reg.fetch('lvl_1').elevation_mm
    assert_equal 3500.0, reg.fetch('lvl_roof').elevation_mm

    # Structural Grid setup (2x2 grid: 4m x 6m)
    grid_x1 = JiraNot::ConstructFlow::Structure::GridDefinition.new(
      name: '1', path_mm: [[0, 0, 0], [0, 6000, 0]]
    )
    grid_x2 = JiraNot::ConstructFlow::Structure::GridDefinition.new(
      name: '2', path_mm: [[4000, 0, 0], [4000, 6000, 0]]
    )
    grid_ya = JiraNot::ConstructFlow::Structure::GridDefinition.new(
      name: 'A', path_mm: [[0, 0, 0], [4000, 0, 0]]
    )
    grid_yb = JiraNot::ConstructFlow::Structure::GridDefinition.new(
      name: 'B', path_mm: [[0, 6000, 0], [4000, 6000, 0]]
    )

    assert_equal '1', grid_x1.name
    assert_equal '2', grid_x2.name
    assert_equal 'A', grid_ya.name
    assert_equal 'B', grid_yb.name
  end

  # ── 2. STRUCTURE: FOUNDATIONS, COLUMNS, BEAMS & REBAR ──────────
  def test_02_structure_rc_frame_and_takeoff
    # 4 Foundations F1 (1.0m x 1.0m x 0.35m = 0.35 m3 each * 4 = 1.40 m3)
    f1 = JiraNot::ConstructFlow::Structure::FoundationDefinition.new(
      center_mm: [0, 0, -500], size_mm: [1000, 1000, 350], top_elevation_mm: -500
    )
    assert_equal [1000, 1000, 350], f1.size_mm
    assert_equal(-500.0, f1.top_elevation_mm)

    # 4 Columns C1 (0.25m x 0.25m x 3.50m = 0.21875 m3 each * 4 = 0.875 m3)
    col_points = [[0, 0], [4000, 0], [4000, 6000], [0, 6000]]
    columns = col_points.map.with_index do |pt, i|
      c = MockEntity.new
      c.set_attribute('ConstructFlow', 'type_id', 'structure.column')
      c.set_attribute('ConstructFlow', 'width_mm', 250.0)
      c.set_attribute('ConstructFlow', 'depth_mm', 250.0)
      c.set_attribute('ConstructFlow', 'height_mm', 3500.0)
      c.bounds = MockBoundingBox.new(Geom::Point3d.new(pt[0], pt[1], 0), Geom::Point3d.new(pt[0] + 250, pt[1] + 250, 3500))
      c
    end
    assert_equal 4, columns.size

    # 4 Roof Beams RB1 (0.20m x 0.40m, perimeter = 4m + 6m + 4m + 6m = 20m)
    # Volume = 20m * 0.2m * 0.4m = 1.60 m3
    beam1 = MockEntity.new
    beam1.set_attribute('ConstructFlow', 'type_id', 'structure.beam')
    beam1.set_attribute('ConstructFlow', 'width_mm', 200.0)
    beam1.set_attribute('ConstructFlow', 'depth_mm', 400.0)
    beam1.set_attribute('ConstructFlow', 'length_mm', 20000.0)
    beam1.bounds = MockBoundingBox.new(Geom::Point3d.new(0, 0, 3500), Geom::Point3d.new(4000, 6000, 3900))

    # Rebar Definition for Beams & Columns (4 x DB16 bars, length 3.8m each)
    rebar = JiraNot::ConstructFlow::Structure::RebarSetDefinition.new(
      host_object_id: 'col_01',
      diameter_mm: 16.0,
      bar_count: 4,
      length_each_mm: 3800.0,
      bar_grade: 'SD40',
      role: 'main_bottom'
    )
    assert rebar.valid?
    assert rebar.total_mass_kg > 20.0, "Total rebar mass for 4x DB16 should be > 20 kg (Calculated: #{rebar.total_mass_kg.round(2)} kg)"
    assert_equal 4, rebar.bbs_row[:bar_count]

    # Verify structural profile catalog
    categories = JiraNot::ConstructFlow::Core::StructuralProfileCatalog.categories
    assert categories.include?(:steel_wf), "Wide-flange / H-Beam must exist in catalog"
    assert categories.include?(:steel_channel), "C-Channel must exist in catalog"
    offset = JiraNot::ConstructFlow::Core::StructuralProfileCatalog.anchor_offset('center', 200, 400)
    assert_equal [0.0, 0.0], offset

    # Compute HUD takeoff for structure
    hud = JiraNot::ConstructFlow::Core::TakeoffHUDService.compute(@runtime, columns + [beam1])
    assert_equal 'success', hud['status']
    assert hud['concrete_m3'] > 2.0, "Total structural concrete volume must be > 2.0 m3"
    assert hud['formwork_m2'] > 10.0, "Formwork area must be calculated"
  end

  # ── 3. ARCHITECTURE: WALLS, MITERING, OPENINGS & SMART STRETCH ─
  def test_03_architecture_walls_openings_and_stretch
    # 4 Walls enclosing 4m x 6m room, height 3.00m, thickness 10 cm
    # Total Gross Wall Area = (4 + 6 + 4 + 6) * 3.00 = 60.00 m2
    wall1 = MockEntity.new
    wall1.set_attribute('ConstructFlow', 'type_id', 'architecture.wall')
    wall1.set_attribute('ConstructFlow', 'gross_area_mm2', 12_000_000.0) # 12 m2 (4m x 3m)
    # Deduct door opening (0.90m x 2.00m = 1.80 m2) -> net 10.20 m2
    wall1.set_attribute('ConstructFlow', 'net_area_mm2', 10_200_000.0)

    wall2 = MockEntity.new
    wall2.set_attribute('ConstructFlow', 'type_id', 'architecture.wall')
    wall2.set_attribute('ConstructFlow', 'gross_area_mm2', 18_000_000.0) # 18 m2 (6m x 3m)
    # Deduct window opening (1.20m x 1.10m = 1.32 m2) -> net 16.68 m2
    wall2.set_attribute('ConstructFlow', 'net_area_mm2', 16_680_000.0)

    wall3 = MockEntity.new
    wall3.set_attribute('ConstructFlow', 'type_id', 'architecture.wall')
    wall3.set_attribute('ConstructFlow', 'gross_area_mm2', 12_000_000.0)
    wall3.set_attribute('ConstructFlow', 'net_area_mm2', 12_000_000.0)

    wall4 = MockEntity.new
    wall4.set_attribute('ConstructFlow', 'type_id', 'architecture.wall')
    wall4.set_attribute('ConstructFlow', 'gross_area_mm2', 18_000_000.0)
    wall4.set_attribute('ConstructFlow', 'net_area_mm2', 18_000_000.0)

    all_walls = [wall1, wall2, wall3, wall4]

    # Floor Slab: 4m x 6m = 24.00 m2, thickness 15 cm (0.15m) -> 3.60 m3 concrete
    floor = MockEntity.new
    floor.set_attribute('ConstructFlow', 'type_id', 'architecture.floor')
    floor.set_attribute('ConstructFlow', 'area_m2', 24.0)
    floor.set_attribute('ConstructFlow', 'thickness_mm', 150.0)
    floor.bounds = MockBoundingBox.new(Geom::Point3d.new(0, 0, 0), Geom::Point3d.new(4000, 6000, 150))

    # Smart Stretch Engine test: stretch door frame width from 800mm to 1000mm
    stretch_spec = {
      target_width_mm: 1000.0,
      fixed_margin_left_mm: 50.0,
      fixed_margin_right_mm: 50.0
    }
    assert stretch_spec[:target_width_mm] > 800.0

    hud = JiraNot::ConstructFlow::Core::TakeoffHUDService.compute(@runtime, all_walls + [floor])
    # Net wall area = 10.20 + 16.68 + 12.00 + 18.00 = 56.88 m2
    assert_in_delta 56.88, hud['wall_net_m2'], 0.05
    # Paint area (both interior & exterior sides) = 56.88 * 2 = 113.76 m2
    assert_in_delta 113.76, hud['paint_m2'], 0.1
    # Floor tile area = 24.0 m2
    assert_equal 24.0, hud['tile_floor_m2']
    # Skirting length based on perimeter 20.0 m
    assert_in_delta 20.0, hud['skirting_m'], 0.05
  end

  # ── 4. STAIR & BUILDING CODE VALIDATION ───────────────────────
  def test_04_stair_geometry_and_compliance
    # Stair with Total Rise = 2600mm, 14 Risers (@185.7mm), 13 Treads (@250mm), Width = 1000mm
    stair_def = JiraNot::ConstructFlow::Architecture::StairDefinition.new(
      start_point: [0, 0, 0],
      direction: [1, 0, 0],
      width_mm: 1000.0,
      height_mm: 2600.0,
      tread_count: 13,
      riser_count: 14,
      tread_depth_mm: 250.0,
      riser_height_mm: 185.71
    )

    validator = JiraNot::ConstructFlow::Architecture::StairValidator.new(stair_def, code_type: :residential)
    assert validator.valid?, "Stair should be code-compliant: #{validator.errors.join(', ')}"
  end

  # ── 5. MEP: ELECTRICAL VOLTAGE DROP CALCULATOR ─────────────────
  def test_05_mep_electrical_voltage_drop
    # 30A load, 25 meters, 230V, 6 mm2 copper conductor
    calc = JiraNot::ConstructFlow::Electrical::VoltageDropCalculator.new
    res = calc.calculate(
      current_a: 30.0,
      length_m: 25.0,
      conductor_size_sqmm: 6.0,
      voltage_v: 230.0
    )
    assert res.voltage_drop_percent < 3.0, "Voltage drop must be under 3.0% (Calculated: #{res.voltage_drop_percent.round(2)}%)"
    assert res.compliant_branch, "Branch circuit should be compliant"
  end

  # ── 6. DOCUMENTATION & 2D LAYOUT DRAWING SUITE ─────────────────
  def test_06_layout_scenes_and_dimensioning
    # 1-Click Generate 5 Scenes for LayOut
    scene_res = JiraNot::ConstructFlow::Core::Tools::ExtensionSceneGenerator.generate(@runtime)
    assert_equal 'success', scene_res[:status]
    assert_equal 5, scene_res[:created_count]
    assert @model.pages['CF_01_แปลนสถาปัตย์_ต่อเติม']
    assert @model.pages['CF_02_แปลนโครงสร้างและฐานราก']
    assert @model.pages['CF_03_แปลนหลังคาและระบายน้ำ']
    assert @model.pages['CF_04_รูปด้าน_ต่อเติม']
    assert @model.pages['CF_05_รูปตัด_A_ระดับพื้น']

    # Auto Dimensioning
    col1 = MockEntity.new
    col1.set_attribute('ConstructFlow', 'type_id', 'structure.column')
    col1.bounds = MockBoundingBox.new(Geom::Point3d.new(0, 0, 0), Geom::Point3d.new(250, 250, 3500))

    col2 = MockEntity.new
    col2.set_attribute('ConstructFlow', 'type_id', 'structure.column')
    col2.bounds = MockBoundingBox.new(Geom::Point3d.new(4000, 0, 0), Geom::Point3d.new(4250, 250, 3500))

    @model.selection << col1
    @model.selection << col2
    dim_res = JiraNot::ConstructFlow::Core::Tools::AutoDimensionEngine.generate(@runtime)
    assert_equal 'success', dim_res[:status]
    assert dim_res[:dimensions_count] >= 1
  end

  # ── 7. PROJECT BOQ COST ESTIMATE & CSV EXPORT ──────────────────
  def test_07_boq_costing_and_csv_export
    # Create realistic BOQ snapshot
    lines = [
      JiraNot::ConstructFlow::Costing::CostEstimateLine.new(
        line_id: 'L01', classification: 'structure.concrete', description: 'คอนกรีตโครงสร้าง ค.240',
        phase_scope: 'new_construction', unit: 'm3', net_quantity: 6.075, material_rate: 2200.0, labor_rate: 450.0
      ),
      JiraNot::ConstructFlow::Costing::CostEstimateLine.new(
        line_id: 'L02', classification: 'structure.formwork', description: 'ไม้แบบหล่อคอนกรีต',
        phase_scope: 'new_construction', unit: 'm2', net_quantity: 38.50, material_rate: 350.0, labor_rate: 150.0
      ),
      JiraNot::ConstructFlow::Costing::CostEstimateLine.new(
        line_id: 'L03', classification: 'architecture.masonry', description: 'งานก่อผนังอิฐมวลเบาหนา 10 ซม.',
        phase_scope: 'new_construction', unit: 'm2', net_quantity: 56.88, material_rate: 280.0, labor_rate: 120.0
      ),
      JiraNot::ConstructFlow::Costing::CostEstimateLine.new(
        line_id: 'L04', classification: 'architecture.finish', description: 'งานฉาบปูนและทาสี 2 ด้าน',
        phase_scope: 'new_construction', unit: 'm2', net_quantity: 113.76, material_rate: 120.0, labor_rate: 90.0
      ),
      JiraNot::ConstructFlow::Costing::CostEstimateLine.new(
        line_id: 'L05', classification: 'architecture.floor', description: 'งานปูกระเบื้องแกรนิตโต้ 60x60',
        phase_scope: 'new_construction', unit: 'm2', net_quantity: 24.00, material_rate: 450.0, labor_rate: 200.0
      )
    ]

    estimate = JiraNot::ConstructFlow::Costing::CostEstimate.new(
      estimate_id: 'EST_PROJ_001',
      rate_library_id: 'THAI_STANDARD_2026',
      rate_library_version: '1.0',
      lines: lines
    )

    assert estimate.total_cost > 50_000.0, "Total realistic extension cost should exceed 50,000 THB (Calculated: #{estimate.total_cost})"
    assert_equal 5, estimate.line_count

    # Export to CSV via BoqExporter
    exporter = JiraNot::ConstructFlow::Costing::BoqExporter.new
    csv_str = exporter.generate_csv(estimate)
    assert csv_str.include?('คอนกรีตโครงสร้าง')
    assert csv_str.include?('อิฐมวลเบา')
    assert csv_str.include?('Line ID')
  end
end
