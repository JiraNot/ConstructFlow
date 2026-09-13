
module Geom
  class Vector3d
    attr_accessor :x, :y, :z
    def initialize(x = 0.0, y = 0.0, z = 0.0); @x = x.to_f; @y = y.to_f; @z = z.to_f; end
    def -(other); Vector3d.new(@x - other.x, @y - other.y, @z - other.z); end
    def +(other); Vector3d.new(@x + other.x, @y + other.y, @z + other.z); end
    def *(val); val.is_a?(Numeric) ? Vector3d.new(@x * val, @y * val, @z * val) : Vector3d.new(@y * val.z - @z * val.y, @z * val.x - @x * val.z, @x * val.y - @y * val.x); end
    def %(other); @x * other.x + @y * other.y + @z * other.z; end
    def length; Math.sqrt(@x * @x + @y * @y + @z * @z); end
    def normalize; len = length; len > 0.0001 ? Vector3d.new(@x / len, @y / len, @z / len) : self; end
    def normalize!; len = length; len > 0.0001 ? (@x /= len; @y /= len; @z /= len; self) : self; end
  end
end
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
  end unless defined?(Geom::Vector3d)
end

require File.join(CORE, 'tools', 'extension_scene_generator')
require File.join(CORE, 'tools', 'auto_dimension_engine')
require File.join(CORE, 'tools', 'spot_elevation_tool')
require File.join(CORE, 'takeoff_hud_service')

class ExtensionDocumentationAndTakeoffTest < Minitest::Test
  class MockPoint3d
    attr_accessor :x, :y, :z
    def initialize(x, y, z)
      @x = x.to_f; @y = y.to_f; @z = z.to_f
    end
    def offset(vec)
      MockPoint3d.new(@x + vec.x, @y + vec.y, @z + vec.z)
    end
    def to_m; @z / 1000.0; end
  end

  class MockBoundingBox
    attr_accessor :min, :max
    def initialize(min_pt, max_pt)
      @min = min_pt
      @max = max_pt
    end
    def center
      MockPoint3d.new((@min.x + @max.x) / 2.0, (@min.y + @max.y) / 2.0, (@min.z + @max.z) / 2.0)
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
      res = MockBoundingBox.new(MockPoint3d.new(0,0,0), MockPoint3d.new(0,0,0))
      def res.valid?; @v; end
      res.instance_variable_set(:@v, valid)
      res
    end
  end

  class MockCamera
    attr_accessor :perspective, :eye, :target, :up
    def set(eye, target, up)
      @eye = eye; @target = target; @up = up
    end
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
    def initialize
      @pages = {}
    end
    def [](name); @pages[name]; end
    def add(name)
      @pages[name] = MockPage.new(name)
    end
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
      @bounds = MockBoundingBox.new(MockPoint3d.new(0, 0, 0), MockPoint3d.new(300, 300, 3500))
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
      @bounds = MockBoundingBox.new(MockPoint3d.new(0, 0, 0), MockPoint3d.new(10000, 10000, 4000))
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
  end

  def test_extension_scene_generator
    result = JiraNot::ConstructFlow::Core::Tools::ExtensionSceneGenerator.generate(@runtime)
    assert_equal 'success', result[:status], "Scene generator failed: #{result[:message]}"
    assert_equal 5, result[:created_count]
    assert_equal 5, @model.pages.size
    assert @model.pages['CF_01_แปลนสถาปัตย์_ต่อเติม']
    assert @model.pages['CF_02_แปลนโครงสร้างและฐานราก']
    assert @model.pages['CF_03_แปลนหลังคาและระบายน้ำ']
    assert @model.pages['CF_04_รูปด้าน_ต่อเติม']
    assert @model.pages['CF_05_รูปตัด_A_ระดับพื้น']
  end

  def test_auto_dimension_columns
    col1 = MockEntity.new
    col1.set_attribute('ConstructFlow', 'type_id', 'structure.column')
    col1.bounds = MockBoundingBox.new(MockPoint3d.new(0, 0, 0), MockPoint3d.new(300, 300, 3500))

    col2 = MockEntity.new
    col2.set_attribute('ConstructFlow', 'type_id', 'structure.column')
    col2.bounds = MockBoundingBox.new(MockPoint3d.new(4000, 0, 0), MockPoint3d.new(4300, 300, 3500))

    @model.selection << col1
    @model.selection << col2

    result = JiraNot::ConstructFlow::Core::Tools::AutoDimensionEngine.generate(@runtime)
    assert_equal 'success', result[:status], "Auto dimension failed: #{result[:message]}"
    assert result[:dimensions_count] >= 1
  end

  def test_takeoff_hud_calculation_and_hierarchy
    # Add a column
    col = MockEntity.new
    col.set_attribute('ConstructFlow', 'type_id', 'structure.column')
    col.set_attribute('ConstructFlow', 'width_mm', 300.0)
    col.set_attribute('ConstructFlow', 'depth_mm', 300.0)
    col.set_attribute('ConstructFlow', 'height_mm', 3500.0)
    col.bounds = MockBoundingBox.new(MockPoint3d.new(0, 0, 0), MockPoint3d.new(300, 300, 3500))

    # Add a beam
    beam = MockEntity.new
    beam.set_attribute('ConstructFlow', 'type_id', 'structure.beam')
    beam.set_attribute('ConstructFlow', 'width_mm', 200.0)
    beam.set_attribute('ConstructFlow', 'depth_mm', 400.0)
    beam.set_attribute('ConstructFlow', 'length_mm', 4000.0)
    beam.bounds = MockBoundingBox.new(MockPoint3d.new(0, 0, 3500), MockPoint3d.new(4000, 200, 3900))

    # Add a wall
    wall = MockEntity.new
    wall.set_attribute('ConstructFlow', 'type_id', 'architecture.wall')
    wall.set_attribute('ConstructFlow', 'gross_area_mm2', 12_000_000.0) # 12 m2
    wall.set_attribute('ConstructFlow', 'net_area_mm2', 10_000_000.0)   # 10 m2 after window deduction

    # Add a floor
    floor = MockEntity.new
    floor.set_attribute('ConstructFlow', 'type_id', 'architecture.floor')
    floor.set_attribute('ConstructFlow', 'area_m2', 24.0)
    floor.set_attribute('ConstructFlow', 'thickness_mm', 150.0)
    floor.bounds = MockBoundingBox.new(MockPoint3d.new(0, 0, 0), MockPoint3d.new(4000, 6000, 150))

    selection = [col, beam, wall, floor]
    hud = JiraNot::ConstructFlow::Core::TakeoffHUDService.compute(@runtime, selection)

    assert_equal 'success', hud['status']
    assert_equal 4, hud['selection_count']
    assert hud['concrete_m3'] > 0.0, "Concrete volume should be calculated"
    assert hud['formwork_m2'] > 0.0, "Formwork area should be calculated"
    assert_equal 10.0, hud['wall_net_m2'], "Net wall area should be 10 m2"
    assert_equal 20.0, hud['paint_m2'], "Paint area should be 2 sides (20 m2)"
    assert_equal 24.0, hud['tile_floor_m2'], "Floor tiles should be 24 m2"
  end
end
