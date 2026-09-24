# frozen_string_literal: true

require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/core/model_materials'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/wall_geometry'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/floor_geometry'
require_relative '../../apps/sketchup-extension/constructflow/modules/roof/geometry'
require_relative '../../apps/sketchup-extension/constructflow/modules/door_window/door_window_geometry'

# Recording fakes: every add_face/add_group records what geometry produced,
# so the new construction-detail code can be asserted layer by layer.
class RecordingFace
  attr_reader :corners_su, :pushpulls, :reversed
  attr_accessor :material

  def initialize(corners_su)
    @corners_su = corners_su
    @pushpulls = []
    @reversed = false
  end

  def normal
    # Newell's method on the polygon (su units).
    nx = ny = nz = 0.0
    corners_su.each_with_index do |a, index|
      b = corners_su[(index + 1) % corners_su.length]
      nx += (a.y - b.y) * (a.z + b.z)
      ny += (a.z - b.z) * (a.x + b.x)
      nz += (a.x - b.x) * (a.y + b.y)
    end
    Struct.new(:x, :y, :z).new(nx, ny, nz)
  end

  def reverse!
    @reversed = true
  end

  def pushpull(value)
    @pushpulls << value
  end
end

class RecordingEntities
  attr_reader :faces, :groups, :lines

  def initialize
    @faces = []
    @groups = []
    @lines = []
  end

  def add_face(*corners)
    # Geometry code sometimes passes a single array of points instead of
    # splatted arguments; normalize here.
    corners = corners.first if corners.length == 1 && corners.first.is_a?(Array)
    face = RecordingFace.new(corners)
    @faces << face
    face
  end

  def add_group
    group = RecordingGroup.new
    @groups << group
    group
  end

  def add_line(first_pt, second_pt)
    @lines << [first_pt, second_pt]
    Struct.new(:first_pt, :second_pt).new(first_pt, second_pt)
  end

  def clear!
    @faces.clear
    @groups.clear
    @lines.clear
  end
end

class RecordingGroup
  attr_reader :entities
  attr_accessor :name, :model

  def initialize
    @entities = RecordingEntities.new
  end
end

class RecordingMaterials
  def [](_name)
    nil
  end

  def add(name)
    Struct.new(:name).new(name)
  end
end

class RecordingModel
  attr_reader :materials

  def initialize
    @materials = RecordingMaterials.new
  end

  def active_entities
    RecordingEntities.new
  end
end

# Capability double whose methods accept the opening argument (OpenStruct
# cannot hold lambdas callable with arguments).
class FakeInfillCapability
  def initialize(frame_points, depth_mm)
    @frame_points = frame_points
    @depth_mm = depth_mm
  end

  def frame_points(_opening)
    @frame_points
  end

  def infill_depth_mm(_opening)
    @depth_mm
  end
end

class ModelDetailGeometryTest < Minitest::Test
  MM = 1.0 / 25.4

  def pushpull_magnitude(value)
    return value.abs if value.is_a?(Numeric)

    Math.sqrt((value.x**2) + (value.y**2) + (value.z**2))
  end

  def test_wall_renders_three_construction_layers_with_materials
    geometry = JiraNot::ConstructFlow::Architecture::WallGeometry.new
    definition = wall_definition(100.0)
    group = RecordingGroup.new
    group.model = RecordingModel.new

    geometry.rebuild!(group, definition)

    assert_equal 1, group.entities.groups.length, 'layered wall must nest one Construction Layers group'
    layers_group = group.entities.groups.first
    assert_equal 'Construction Layers', layers_group.name

    materials = layers_group.entities.faces.map { |face| face.material&.name }
    assert_equal ['CF Plaster', 'CF AAC Block', 'CF Plaster'], materials
    # Every layer is the full wall height.
    layers_group.entities.faces.each do |face|
      assert_in_delta 2800.0 * MM, face.pushpulls.first, 0.001
    end
  end

  def test_wall_openings_render_cells_per_layer
    geometry = JiraNot::ConstructFlow::Architecture::WallGeometry.new
    definition = wall_definition(100.0)
    group = RecordingGroup.new
    group.model = RecordingModel.new
    openings = [{ 'segment_index' => 0, 'start_offset_mm' => 500, 'width_mm' => 900, 'height_mm' => 2100, 'sill_mm' => 900 }]

    geometry.rebuild!(group, definition, openings: openings)

    layers_group = group.entities.groups.first
    refute_nil layers_group
    # 3 x-cells x 2 z-cells = 6 cells minus the opening void = 5, x 3 layers.
    assert_equal 15, layers_group.entities.faces.length
    material_names = layers_group.entities.faces.map { |face| face.material&.name }.uniq.sort
    assert_equal ['CF AAC Block', 'CF Plaster'], material_names
  end

  def test_floor_renders_slab_and_finish_layers_stacked
    geometry = JiraNot::ConstructFlow::Architecture::FloorGeometry.new
    definition = JiraNot::ConstructFlow::Architecture::FloorDefinition.new(
      boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]],
      thickness_mm: 150,
      material_id: 'finish.tile'
    )
    group = RecordingGroup.new
    group.model = RecordingModel.new

    geometry.rebuild!(group, definition)

    layers_group = group.entities.groups.first
    refute_nil layers_group
    faces = layers_group.entities.faces
    assert_equal 2, faces.length
    assert_equal(['CF Concrete', 'CF Tile'], faces.map { |face| face.material&.name })
    slab, finish = faces
    assert_in_delta 138.0 * MM, slab.pushpulls.first, 0.001
    assert_in_delta 12.0 * MM, finish.pushpulls.first, 0.001
    # Finish layer starts on top of the slab (z offset 138 mm).
    finish_base_z = finish.corners_su.map(&:z).min
    slab_base_z = slab.corners_su.map(&:z).min
    assert_in_delta((138.0 * MM), finish_base_z - slab_base_z, 0.001)
  end

  def test_roof_extends_eaves_and_adds_fascia
    geometry = JiraNot::ConstructFlow::Roof::Geometry.new
    definition = JiraNot::ConstructFlow::Roof::RoofDefinition.new(
      boundary_mm: [[0, 0, 0], [6000, 0, 0], [6000, 4000, 0], [0, 4000, 0]],
      roof_form: 'lean_to',
      slope_percent: 5.0,
      slope_direction_xy: [0, 1],
      low_elevation_mm: 3000,
      covering_system: 'metal_sheet',
      thickness_mm: 20
    )
    group = RecordingGroup.new
    group.model = RecordingModel.new

    geometry.rebuild_roof!(group, definition)

    sheet_faces = group.entities.faces
    # 1 roof sheet + 1 fascia board along the low eave.
    assert_equal 2, sheet_faces.length
    sheet = sheet_faces.first
    overhang = 300.0 * MM
    max_y = sheet.corners_su.map(&:y).max
    min_y = sheet.corners_su.map(&:y).min
    # Slope direction +y: eave is the low side (y_min) extended outward (-y).
    assert_in_delta(-overhang, min_y, 0.001)
    assert_in_delta(4000.0 * MM, max_y, 0.001)
    fascia = sheet_faces[1]
    assert_equal 'CF Timber', fascia.material&.name
    assert_operator pushpull_magnitude(fascia.pushpulls.first), :>, 0
  end

  def test_roof_eaves_leave_shared_ridge_vertices_unmoved
    geometry = JiraNot::ConstructFlow::Roof::Geometry.new
    definition = JiraNot::ConstructFlow::Roof::RoofDefinition.new(
      boundary_mm: [[0, 0, 0], [6000, 0, 0], [6000, 4000, 0], [0, 4000, 0]],
      roof_form: 'gable',
      slope_percent: 10.0,
      slope_direction_xy: [0, 1],
      low_elevation_mm: 3000
    )
    group = RecordingGroup.new
    group.model = RecordingModel.new

    geometry.rebuild_roof!(group, definition)

    # Both gable facets were created and share the (unmoved) ridge line;
    # each low eave gets its own fascia board.
    sheets = group.entities.faces
    assert_equal 4, sheets.length # 2 facets + 2 fascia boards
    ridge_ys = sheets.first(2).flat_map { |face| face.corners_su.map(&:y) }.uniq
    assert(
      ridge_ys.any? { |y| (y - (2000.0 * MM)).abs < 0.01 },
      "ridge must stay at y = 2000 mm, got #{ridge_ys}"
    )
  end

  def test_door_window_builds_3d_frame_glass_and_leaf
    geometry = JiraNot::ConstructFlow::DoorWindow::DoorWindowGeometry.new
    type = JiraNot::ConstructFlow::DoorWindow::DoorWindowType.new(
      id: 'test.slide', name: 'Test Slider', category: 'window', operation: 'sliding',
      width_mm: 1200, height_mm: 1500, frame_material: 'aluminium',
      frame_width_mm: 50, panel_roles: %w[slide_left slide_right], panel_style: 'glazed'
    )
    capability = FakeInfillCapability.new(opening_frame, 100.0)
    group = RecordingGroup.new
    group.model = RecordingModel.new

    geometry.rebuild!(group, opening_object: Object.new, type: type, opening_host_capability: capability)

    materials = group.entities.faces.map { |face| face.material&.name }
    assert_includes materials, 'CF Timber'  # frame members + leaf slabs
    assert_includes materials, 'CF Glass'   # glazing
    # 4 frame members + 1 glass + 2 leaf slabs
    assert_equal 7, group.entities.faces.length
    leaf = group.entities.faces.last
    assert_in_delta 40.0 * MM, pushpull_magnitude(leaf.pushpulls.first), 0.001
  end

  private

  def opening_frame
    # 1200 x 1500 rectangular opening on the x axis, sill 900.
    [[0, 0, 900], [1200, 0, 900], [1200, 0, 2400], [0, 0, 2400]]
  end

  def wall_definition(thickness_mm)
    JiraNot::ConstructFlow::Architecture::WallDefinition.new(
      path_mm: [[0, 0, 0], [4000, 0, 0]],
      thickness_mm: thickness_mm,
      height_mm: 2800,
      wall_type_id: 'generic.wall.100'
    )
  end
end
