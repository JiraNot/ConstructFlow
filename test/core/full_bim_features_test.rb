# frozen_string_literal: true

require_relative '../test_helper'

module Sketchup
  unless const_defined?(:InputPoint)
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
      end
    end
  end
end
