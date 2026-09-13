# frozen_string_literal: true

require_relative '../test_helper'


module Geom
  class Vector3d
    attr_accessor :x, :y, :z
    def initialize(x = 0.0, y = 0.0, z = 0.0); @x = x.to_f; @y = y.to_f; @z = z.to_f; end
    def -(other); Vector3d.new(@x - other.x, @y - other.y, @z - other.z); end
    def +(other); Vector3d.new(@x + other.x, @y + other.y, @z + other.z); end
    def *(val); val.is_a?(Numeric) ? Vector3d.new(@x * val, @y * val, @z * val) : Vector3d.new(@y * val.z - @z * val.y, @z * val.x - @x * val.z, @x * val.y - @y * val.x); end
    def %(other); @x * other.x + @y * other.y + @z * other.z; end
    def length; Math.sqrt(@x * @x + @y * @y + @z * @z); end
    def normalize!; len = length; len > 0.0001 ? (@x /= len; @y /= len; @z /= len; self) : self; end
  end unless const_defined?(:Vector3d)

  class Point3d
    def -(other); Vector3d.new(@x - other.x, @y - other.y, @z - other.z); end
    def +(vec); Point3d.new(@x + vec.x, @y + vec.y, @z + vec.z); end
  end
end

module UI
  def self.messagebox(msg, _type = nil); msg; end
  def self.inputbox(*args); nil; end
  def self.savepanel(*args); nil; end
end


module Sketchup
  unless const_defined?(:InputPoint)
    class Face; end
    class Edge; end
    class InputPoint
      attr_accessor :position
      def initialize(pos = Geom::Point3d.new(0, 0, 0))
        @position = pos
      end
      def pick(_view, _x, _y, _anchor = nil); true; end
      def valid?; true; end
      def draw(_view); end
    end
  end

  unless respond_to?(:set_status_text)
    class << self
      attr_accessor :status_text
      def set_status_text(text, _pos = nil); @status_text = text; end
      def status_text=(text); @status_text = text; end
    end
  end
end

require_relative '../../apps/sketchup-extension/constructflow/core/tag_manager'
require_relative '../../apps/sketchup-extension/constructflow/core/viewport_snap_helper'
require_relative '../../apps/sketchup-extension/constructflow/core/html_dialog'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/tools/beam_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/structure/tools/grid_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/tools/floor_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/tools/ceiling_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/tools/wall_edit_tool'

require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/stair_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/tools/stair_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/roof_framing_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/roof_framing_repository'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/tools/roof_framing_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/grid_framing_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/grid_framing_repository'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/tools/grid_framing_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/curtain_wall_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/curtain_wall_repository'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/tools/curtain_wall_tool'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/stretch_by_target_area'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/revit_auto_roof'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/hip_gable_roof_generator'
require_relative '../../apps/sketchup-extension/constructflow/core/smart_stretch_engine'
require_relative '../../apps/sketchup-extension/constructflow/core/custom_profile_store'

require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/tools/stretch_by_area_tool'




module JiraNot
  module ConstructFlow
    module Core
      class FullBimFeaturesTest < Minitest::Test
        class MockLayerCollection
          def initialize
            @layers = {}
          end
          def [](name)
            @layers[name]
          end
          def add(name)
            @layers[name] ||= Struct.new(:name).new(name)
          end
        end

        class MockEntity
          attr_accessor :layer
        end

        class MockModel
          attr_reader :layers, :selection
          attr_accessor :selected_tool

          def initialize
            @layers = MockLayerCollection.new
            @selection = []
            @selected_tool = nil
          end

          def select_tool(tool)
            @selected_tool = tool
          end
        end

        class MockView
          attr_accessor :points_drawn, :text_drawn, :drawing_color, :line_width, :line_stipple

          def initialize
            @points_drawn = []
            @text_drawn = []
          end

          def draw_points(points, size, style, color)
            @points_drawn << { points: points, size: size, style: style, color: color }
          end

          def draw_text(point, text, options = {})
            @text_drawn << { point: point, text: text, color: options[:color] }
          end

          def screen_coords(point)
            point
          end
        end

        def setup
          @model = MockModel.new
          @runtime = Struct.new(:active_model, :smart_objects, :project, :levels).new(
            @model,
            Struct.new(:all, :size).new([], 0),
            Struct.new(:project_id, :working_phase).new('CF-TEST', 'new_construction'),
            Struct.new(:size).new(2)
          )
        end

        # ── 1. TagManager Tests ─────────────────────────────────
        def test_tag_for_type_mappings
          assert_equal 'CF_Structure_Column', TagManager.tag_for_type('structure.column')
          assert_equal 'CF_Structure_Beam', TagManager.tag_for_type('structure.beam')
          assert_equal 'CF_Structure_Foundation', TagManager.tag_for_type('structure.foundation')
          assert_equal 'CF_Architecture_Wall', TagManager.tag_for_type('architecture.wall')
          assert_equal 'CF_Architecture_Floor', TagManager.tag_for_type('architecture.floor')
          assert_equal 'CF_Architecture_Ceiling', TagManager.tag_for_type('architecture.ceiling')
          assert_equal 'CF_MEP_Electrical', TagManager.tag_for_type('mep.conduit')
          assert_equal 'CF_MEP_Drainage', TagManager.tag_for_type('mep.pipe')
        end

        def test_tag_manager_assigns_layer
          entity = MockEntity.new
          tag = TagManager.assign_tag(@model, entity, 'architecture.wall')
          assert_equal 'CF_Architecture_Wall', tag.name
          assert_equal tag, entity.layer
        end

        # ── 2. ViewportSnapHelper Tests ─────────────────────────
        def test_viewport_snap_helper_draws_glyphs
          view = MockView.new
          pt = Geom::Point3d.new(100, 200, 0)

          # Endpoint (Green Box)
          ViewportSnapHelper.draw_snap_glyph(view, pt, { kind: 'endpoint' })
          assert view.points_drawn.any? { |p| p[:color] == 'green' && p[:style] == 1 }
          assert view.text_drawn.any? { |t| t[:text].include?('Endpoint') }

          # Midpoint (Cyan Triangle)
          ViewportSnapHelper.draw_snap_glyph(view, pt, { kind: 'midpoint' })
          assert view.points_drawn.any? { |p| p[:color] == 'cyan' && p[:style] == 6 }
          assert view.text_drawn.any? { |t| t[:text].include?('Midpoint') }

          # Intersection (Orange X)
          ViewportSnapHelper.draw_snap_glyph(view, pt, { kind: 'intersection' })
          assert view.points_drawn.any? { |p| p[:color] == 'orange' && p[:style] == 4 }
          assert view.text_drawn.any? { |t| t[:text].include?('Intersection') }

          # Close Loop (Gold badge)
          ViewportSnapHelper.draw_snap_glyph(view, pt, { kind: 'close_loop' })
          assert view.points_drawn.any? { |p| p[:color] == 'gold' && p[:style] == 2 }
          assert view.text_drawn.any? { |t| t[:text].include?('Close Loop') }
        end

        # ── 3. BOQ Generator Tests ──────────────────────────────
        def test_generate_boq_data
          boq = HtmlDialogManager.generate_boq_data(@runtime)
          assert_instance_of Hash, boq
          assert_equal 'CF-TEST', boq[:project_id]
          assert_equal 'THB', boq[:currency]
          assert boq[:grand_total] > 0, "Grand total should be positive, got #{boq[:grand_total]}"
          assert_equal 3, boq[:categories].length

          categories = boq[:categories].map { |c| c[:name] }
          assert categories.any? { |n| n.include?('Structure') }
          assert categories.any? { |n| n.include?('Architecture') }
          assert categories.any? { |n| n.include?('MEP') }

          boq[:categories].each do |cat|
            assert cat[:items].length > 0, "Category #{cat[:name]} should have line items"
            cat[:items].each do |item|
              assert item[:code]
              assert item[:name]
              assert item[:unit]
              assert item[:qty] > 0
              assert item[:total] > 0
            end
          end
        end

        # ── 4. Core Tool Selection Handlers ──────────────────────
        def test_draw_beam_action
          handler = HtmlDialogManager::ACTIONS['draw_beam']
          assert handler
          handler.call(@runtime, { 'section_mm' => [200, 400] })
          assert_instance_of Structure::Tools::BeamTool, @model.selected_tool
        end

        def test_draw_grid_action
          handler = HtmlDialogManager::ACTIONS['draw_grid']
          assert handler
          handler.call(@runtime, { 'name' => 'B' })
          assert_instance_of Structure::Tools::GridTool, @model.selected_tool
        end

        def test_draw_floor_action
          handler = HtmlDialogManager::ACTIONS['draw_floor']
          assert handler
          handler.call(@runtime, { 'thickness_mm' => 120 })
          assert_instance_of Architecture::Tools::FloorTool, @model.selected_tool
        end

        def test_draw_ceiling_action
          handler = HtmlDialogManager::ACTIONS['draw_ceiling']
          assert handler
          handler.call(@runtime, { 'height_mm' => 2700, 'thickness_mm' => 9 })
          assert_instance_of Architecture::Tools::CeilingTool, @model.selected_tool
        end

        def test_edit_selected_wall_action
          handler = HtmlDialogManager::ACTIONS['edit_selected_wall']
          assert handler
          handler.call(@runtime, {})
          assert_instance_of Architecture::Tools::WallEditTool, @model.selected_tool
        end

        def test_draw_stair_action
          handler = HtmlDialogManager::ACTIONS['draw_stair']
          assert handler
          handler.call(@runtime, {})
          assert_instance_of Architecture::Tools::StairTool, @model.selected_tool
        end

        def test_draw_roof_framing_action
          handler = HtmlDialogManager::ACTIONS['draw_roof_framing']
          assert handler
          handler.call(@runtime, {})
          assert_instance_of Architecture::Tools::RoofFramingTool, @model.selected_tool
        end

        def test_draw_grid_framing_action
          handler = HtmlDialogManager::ACTIONS['draw_grid_framing']
          assert handler
          handler.call(@runtime, {})
          assert_instance_of Architecture::Tools::GridFramingTool, @model.selected_tool
        end

        def test_roof_framing_editable_and_rebuild_repository
          repo = Architecture::RoofFramingRepository.new
          entity = Struct.new(:dict) do
            def set_attribute(dict_name, key, val)
              @dict ||= {}
              @dict[dict_name] ||= {}
              @dict[dict_name][key] = val
            end
            def get_attribute(dict_name, key, default = nil)
              (@dict && @dict[dict_name] && @dict[dict_name][key]) || default
            end
            def attribute_dictionaries
              @dict
            end
          end.new({})

          def_initial = Architecture::RoofFramingDefinition.new(
            boundary_mm: [[0, 0, 0], [6000, 0, 0], [6000, 8000, 0], [0, 8000, 0]],
            pitch_degrees: 30.0,
            truss_spacing_mm: 1000.0,
            purlin_spacing_mm: 300.0,
            overhang_mm: 600.0,
            type: :gable
          )

          assert repo.save(entity, def_initial)
          assert repo.is_roof_framing?(entity)

          loaded = repo.load(entity)
          assert_equal 30.0, loaded.pitch_degrees
          assert_equal 1000.0, loaded.truss_spacing_mm
          assert_equal :gable, loaded.type

          # Modify post-creation (as requested by user)
          def_modified = Architecture::RoofFramingDefinition.new(
            boundary_mm: loaded.boundary_mm,
            pitch_degrees: 35.0,
            truss_spacing_mm: 1200.0,
            purlin_spacing_mm: 350.0,
            overhang_mm: 800.0,
            type: :shed
          )

          assert repo.save(entity, def_modified)
          reloaded = repo.load(entity)
          assert_equal 35.0, reloaded.pitch_degrees
          assert_equal 1200.0, reloaded.truss_spacing_mm
          assert_equal :shed, reloaded.type
        end

        def test_grid_framing_repository_and_definition
          repo = Architecture::GridFramingRepository.new
          entity = Struct.new(:dict) do
            def set_attribute(dict_name, key, val)
              @dict ||= {}
              @dict[dict_name] ||= {}
              @dict[dict_name][key] = val
            end
            def get_attribute(dict_name, key, default = nil)
              (@dict && @dict[dict_name] && @dict[dict_name][key]) || default
            end
            def attribute_dictionaries
              @dict
            end
          end.new({})

          gf_def = Architecture::GridFramingDefinition.new(
            origin_point: [0, 0, 0],
            x_spans_mm: [4000.0, 5000.0],
            y_spans_mm: [4000.0, 4000.0],
            levels_mm: [3200.0],
            column_type_id: 'RC-C-0.20x0.20',
            beam_type_id: 'RC-B-0.20x0.40'
          )

          assert gf_def.valid?
          assert repo.save(entity, gf_def)
          loaded = repo.load(entity)
          assert_equal [4000.0, 5000.0], loaded.x_spans_mm
          assert_equal 'RC-C-0.20x0.20', loaded.column_type_id
        end

        def test_draw_curtain_wall_action
          handler = HtmlDialogManager::ACTIONS['draw_curtain_wall']
          assert handler
          handler.call(@runtime, {})
          assert_instance_of Architecture::Tools::CurtainWallTool, @model.selected_tool
        end

        def test_curtain_wall_repository_and_editability
          repo = Architecture::CurtainWallRepository.new
          entity = Struct.new(:dict) do
            def set_attribute(dict_name, key, val)
              @dict ||= {}
              @dict[dict_name] ||= {}
              @dict[dict_name][key] = val
            end
            def get_attribute(dict_name, key, default = nil)
              (@dict && @dict[dict_name] && @dict[dict_name][key]) || default
            end
            def attribute_dictionaries
              @dict
            end
          end.new({})

          cw_def = Architecture::CurtainWallDefinition.new(
            boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 0, 3000], [0, 0, 3000]],
            grid_width_mm: 1000.0,
            grid_height_mm: 1500.0,
            mullion_width_mm: 50.0,
            mullion_depth_mm: 100.0,
            infill_type: :glass,
            infill_thickness_mm: 10.0
          )

          assert cw_def.valid?
          assert repo.save(entity, cw_def)
          assert repo.is_curtain_wall?(entity)

          loaded = repo.load(entity)
          assert_equal 1000.0, loaded.grid_width_mm
          assert_equal :glass, loaded.infill_type

          # Modify to timber/aluminum sunshade louvers (post-creation edit)
          louver_def = Architecture::CurtainWallDefinition.new(
            boundary_mm: loaded.boundary_mm,
            grid_width_mm: 1200.0,
            grid_height_mm: 150.0,
            mullion_width_mm: 40.0,
            mullion_depth_mm: 80.0,
            infill_type: :louver,
            louver_angle_deg: 45.0,
            infill_thickness_mm: 15.0
          )

          assert repo.save(entity, louver_def)
          reloaded = repo.load(entity)
          assert_equal :louver, reloaded.infill_type
          assert_equal 45.0, reloaded.louver_angle_deg
          assert_equal 150.0, reloaded.grid_height_mm
        end

        def test_stretch_by_target_area_calculation
          # 4m x 5m = 20m2
          pts = [[0, 0, 0], [4000, 0, 0], [4000, 5000, 0], [0, 5000, 0]]
          area = Architecture::StretchByTargetArea.polygon_area_m2(pts)
          assert_in_delta 20.0, area, 0.001

          # Scale uniformly to 30 m2
          scaled = Architecture::StretchByTargetArea.scale_boundary_mm(pts, 30.0, mode: :uniform)
          scaled_area = Architecture::StretchByTargetArea.polygon_area_m2(scaled)
          assert_in_delta 30.0, scaled_area, 0.001

          # Stretch X to 40 m2
          scaled_x = Architecture::StretchByTargetArea.scale_boundary_mm(pts, 40.0, mode: :stretch_x)
          scaled_x_area = Architecture::StretchByTargetArea.polygon_area_m2(scaled_x)
          assert_in_delta 40.0, scaled_x_area, 0.001
        end

        def test_stretch_by_area_tool_action
          handler = HtmlDialogManager::ACTIONS['stretch_by_area']
          assert handler
          handler.call(@runtime, {})
          assert_instance_of Architecture::Tools::StretchByAreaTool, @model.selected_tool
        end

        def test_rebar_and_bbs_actions
          handler_rebar = HtmlDialogManager::ACTIONS['assign_rebar']
          assert handler_rebar

          handler_bbs = HtmlDialogManager::ACTIONS['show_bbs']
          assert handler_bbs
          assert_equal :no_state_push, handler_bbs.call(@runtime, {})
        end

        def test_detect_rooms_action
          handler = HtmlDialogManager::ACTIONS['detect_rooms']
          assert handler
        end

        def test_custom_profile_store_and_extraction
          mock_face = Struct.new(:outer_loop, :normal) do
            def is_a?(klass); klass == Sketchup::Face; end
          end.new(
            Struct.new(:vertices).new([
              Struct.new(:position).new(Geom::Point3d.new(0, 0, 0)),
              Struct.new(:position).new(Geom::Point3d.new(Core::Units.mm_to_su(20), 0, 0)),
              Struct.new(:position).new(Geom::Point3d.new(Core::Units.mm_to_su(20), 0, Core::Units.mm_to_su(120))),
              Struct.new(:position).new(Geom::Point3d.new(0, 0, Core::Units.mm_to_su(120)))
            ]),
            Geom::Vector3d.new(0, 1, 0)
          )

          extracted = Core::CustomProfileStore.extract_profile_from_face(mock_face, anchor: :bottom_left)
          assert extracted
          assert_equal 20.0, extracted[:width_mm]
          assert_equal 120.0, extracted[:depth_mm]

          saved = Core::CustomProfileStore.add_profile('TEST-CORNICE-01', 'Test Cornice', extracted[:points_mm], 20.0, 120.0)
          assert_equal 'TEST-CORNICE-01', saved['code']
          assert Core::StructuralProfileCatalog.find_profile('TEST-CORNICE-01')
        end

        def test_custom_profile_dialog_actions
          assert HtmlDialogManager::ACTIONS['save_custom_profile']
          assert HtmlDialogManager::ACTIONS['sweep_on_selection']
        end

        def test_hip_gable_roof_generator
          generator = Architecture::HipGableRoofGenerator.new(
            form: 'hip',
            slope_deg: 30.0,
            overhang_mm: 800.0,
            thickness_mm: 35.0,
            fascia_height_mm: 200.0
          )
          assert_equal 'hip', generator.form
          assert_equal 30.0, generator.slope_deg
          assert_equal 800.0, generator.overhang_mm

          # 1. Test expand_boundary with 800mm eave overhang
          rect = [[0.0, 0.0, 3000.0], [4000.0, 0.0, 3000.0], [4000.0, 3000.0, 3000.0], [0.0, 3000.0, 3000.0]]
          expanded = generator.expand_boundary(rect, 800.0)
          assert_equal 4, expanded.length
          # Outward bounding box check
          xs = expanded.map { |p| p[0] }
          ys = expanded.map { |p| p[1] }
          assert xs.min < 0.0, 'X min should expand outward'
          assert xs.max > 4000.0, 'X max should expand outward'
          assert ys.min < 0.0, 'Y min should expand outward'
          assert ys.max > 3000.0, 'Y max should expand outward'

          # 2. Test compute_facets for hip roof
          facets = generator.compute_facets(expanded, 3000.0)
          assert_equal 4, facets.length, 'Hip roof should have 4 facets'
          # Verify ridge height is elevated
          all_zs = facets.flatten(1).map { |p| p[2] }
          assert all_zs.max > 3000.0, 'Ridge height should be higher than eave base Z'

          # 3. Test gable roof form
          gable_gen = Architecture::HipGableRoofGenerator.new(form: 'gable', slope_deg: 25.0)
          g_facets = gable_gen.compute_facets(rect, 3000.0)
          assert_equal 2, g_facets.length, 'Gable roof should produce 2 sloped facets'
        end

        def test_hip_gable_roof_dialog_action
          handler = HtmlDialogManager::ACTIONS['generate_hip_gable_roof']
          assert handler, 'generate_hip_gable_roof action must be registered in HtmlDialogManager'
        end

        # ── 15. Smart Stretch (Non-Distort Rescale / 9-Slice) Tests ──
        def test_smart_stretch_engine_9slice
          mock_bounds = Struct.new(:min, :max) do
            def center
              Geom::Point3d.new((min.x + max.x) / 2.0, (min.y + max.y) / 2.0, (min.z + max.z) / 2.0)
            end
          end.new(
            Geom::Point3d.new(0, 0, 0),
            Geom::Point3d.new(Core::Units.mm_to_su(900), Core::Units.mm_to_su(100), Core::Units.mm_to_su(2000))
          )

          mock_entity = Struct.new(:bounds, :entities) do
            def is_a?(klass); klass == Sketchup::Group; end
          end.new(mock_bounds, [])

          engine = Core::SmartStretchEngine.new(
            mock_entity,
            target_width_mm: 1200.0,
            target_height_mm: 2200.0,
            frame_margin_mm: 50.0
          )

          assert_equal 1200.0, engine.target_width_mm
          assert_equal 2200.0, engine.target_height_mm
          assert_equal 50.0, engine.margin_x_mm

          # Test 9-slice displacement calculations
          min_x_su = mock_bounds.min.x
          max_x_su = mock_bounds.max.x
          min_y_su = mock_bounds.min.y
          max_y_su = mock_bounds.max.y
          min_z_su = mock_bounds.min.z
          max_z_su = mock_bounds.max.z

          delta_w_su = Core::Units.mm_to_su(300.0)
          delta_h_su = Core::Units.mm_to_su(200.0)
          margin_x_su = Core::Units.mm_to_su(50.0)
          margin_z_su = Core::Units.mm_to_su(50.0)

          # 1. Left frame vertex at x=20mm (inside 50mm margin) -> dx should be 0 (no distortion)
          dx, _, dz = engine.compute_displacement_3d(
            Core::Units.mm_to_su(20.0), 0, Core::Units.mm_to_su(1000.0),
            min_x_su, max_x_su, min_y_su, max_y_su, min_z_su, max_z_su,
            delta_w_su, 0, delta_h_su, margin_x_su, 0, margin_z_su
          )
          assert_in_delta 0.0, dx, 0.0001, 'Left frame must not move or distort'

          # 2. Right frame inner vertex at x=880mm and outer at x=900mm (20mm frame thickness)
          dx_inner, _, _ = engine.compute_displacement_3d(
            Core::Units.mm_to_su(880.0), 0, Core::Units.mm_to_su(1000.0),
            min_x_su, max_x_su, min_y_su, max_y_su, min_z_su, max_z_su,
            delta_w_su, 0, delta_h_su, margin_x_su, 0, margin_z_su
          )
          dx_outer, _, _ = engine.compute_displacement_3d(
            Core::Units.mm_to_su(900.0), 0, Core::Units.mm_to_su(1000.0),
            min_x_su, max_x_su, min_y_su, max_y_su, min_z_su, max_z_su,
            delta_w_su, 0, delta_h_su, margin_x_su, 0, margin_z_su
          )
          assert_in_delta delta_w_su, dx_inner, 0.0001
          assert_in_delta delta_w_su, dx_outer, 0.0001

          # Thickness check: (900 + dx_outer) - (880 + dx_inner) == 20mm (100% PRESERVED!)
          new_thickness_mm = Core::Units.su_to_mm((Core::Units.mm_to_su(900.0) + dx_outer) - (Core::Units.mm_to_su(880.0) + dx_inner))
          assert_in_delta 20.0, new_thickness_mm, 0.001, 'Right frame thickness must remain exactly 20mm without distortion'

          # 3. Top header frame thickness check: z=1975mm to z=2000mm (25mm header)
          _, _, dz_top_in = engine.compute_displacement_3d(
            Core::Units.mm_to_su(450.0), 0, Core::Units.mm_to_su(1975.0),
            min_x_su, max_x_su, min_y_su, max_y_su, min_z_su, max_z_su,
            delta_w_su, 0, delta_h_su, margin_x_su, 0, margin_z_su
          )
          _, _, dz_top_out = engine.compute_displacement_3d(
            Core::Units.mm_to_su(450.0), 0, Core::Units.mm_to_su(2000.0),
            min_x_su, max_x_su, min_y_su, max_y_su, min_z_su, max_z_su,
            delta_w_su, 0, delta_h_su, margin_x_su, 0, margin_z_su
          )
          new_header_mm = Core::Units.su_to_mm((Core::Units.mm_to_su(2000.0) + dz_top_out) - (Core::Units.mm_to_su(1975.0) + dz_top_in))
          assert_in_delta 25.0, new_header_mm, 0.001, 'Top header frame thickness must remain exactly 25mm without distortion'
        end

        def test_smart_stretch_dialog_action
          handler = HtmlDialogManager::ACTIONS['smart_stretch']
          assert handler, 'smart_stretch action must be registered in HtmlDialogManager'
        end

        # ── 16. Meter Unit Consistency Tests ──
        def test_meter_units_support
          # Test Core::Units meter conversions
          assert_in_delta 1000.0, Core::Units.m_to_mm(1.0)
          assert_in_delta 1.0, Core::Units.mm_to_m(1000.0)
          su_val = Core::Units.m_to_su(1.0)
          assert_in_delta 1.0, Core::Units.su_to_m(su_val)

          # Test SmartStretchEngine accepting meters
          mock_bounds = Struct.new(:min, :max) do
            def center; Geom::Point3d.new(0, 0, 0); end
          end.new(Geom::Point3d.new(0, 0, 0), Geom::Point3d.new(10, 10, 10))
          mock_ent = Struct.new(:bounds, :entities).new(mock_bounds, [])

          engine = Core::SmartStretchEngine.new(
            mock_ent,
            target_width_m: 1.20,
            target_height_m: 2.20,
            frame_margin_m: 0.05
          )
          assert_equal 1200.0, engine.target_width_mm, '1.20 m must normalize to 1200 mm'
          assert_equal 2200.0, engine.target_height_mm, '2.20 m must normalize to 2200 mm'
          assert_equal 50.0, engine.margin_x_mm, '0.05 m must normalize to 50 mm'

          # Test HipGableRoofGenerator accepting meters
          roof_gen = Architecture::HipGableRoofGenerator.new(
            form: 'hip',
            overhang_m: 0.80,
            thickness_m: 0.035,
            fascia_height_m: 0.20
          )
          assert_equal 800.0, roof_gen.overhang_mm, '0.80 m must normalize to 800 mm'
          assert_equal 35.0, roof_gen.thickness_mm, '0.035 m must normalize to 35 mm'
          assert_equal 200.0, roof_gen.fascia_height_mm, '0.20 m must normalize to 200 mm'
        end

        # ── 17. Revit-Style Auto Roof (Roof by Footprint) Tests ──
        def test_revit_auto_roof_generator
          roof = Architecture::RevitAutoRoof.new(
            form: 'gable',
            slope_deg: 30.0,
            overhang_m: 0.80,
            thickness_m: 0.15,
            fascia_height_m: 0.20,
            attach_walls: true
          )
          assert_equal 'gable', roof.form
          assert_equal 30.0, roof.slope_deg
          assert_in_delta 0.80, roof.overhang_m, 0.001
          assert_in_delta 0.15, roof.thickness_m, 0.001
          assert roof.attach_walls

          # Test eave boundary expansion in meters (8m x 6m building)
          wall_boundary_m = [
            [0.0, 0.0, 3.0],
            [8.0, 0.0, 3.0],
            [8.0, 6.0, 3.0],
            [0.0, 6.0, 3.0]
          ]
          eave_boundary = roof.expand_boundary(wall_boundary_m, 0.80)
          assert_equal 4, eave_boundary.length
          xs = eave_boundary.map { |p| p[0] }
          ys = eave_boundary.map { |p| p[1] }
          assert xs.min < 0.0, 'Left eave must overhang outward'
          assert xs.max > 8.0, 'Right eave must overhang outward'
          assert ys.min < 0.0, 'Front eave must overhang outward'
          assert ys.max > 6.0, 'Back eave must overhang outward'

          # Test facet computation and ridge info
          facets, ridge_info = roof.compute_facets(eave_boundary, 3.0)
          assert_equal 2, facets.length, 'Gable roof should produce 2 sloped facets'
          assert_equal :x, ridge_info[:axis], 'Longest axis should be X for ridge'
          assert ridge_info[:ridge_z] > 3.0, 'Ridge elevation must be above base Z'

          # Test Hip form
          hip_roof = Architecture::RevitAutoRoof.new(form: 'hip', slope_deg: 25.0)
          hip_facets, _ = hip_roof.compute_facets(eave_boundary, 3.0)
          assert_equal 4, hip_facets.length, 'Hip roof must produce 4 sloped facets'
        end

        def test_revit_auto_roof_dialog_action
          handler = HtmlDialogManager::ACTIONS['revit_auto_roof']
          assert handler, 'revit_auto_roof action must be registered in HtmlDialogManager'
        end
      end
    end
  end
end
