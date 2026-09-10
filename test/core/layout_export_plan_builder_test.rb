# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'drawing_view_preset_registry')
require File.join(CORE, 'drawing_view_preset_registration')
require File.join(CORE, 'drawing_sheet_spec')
require File.join(CORE, 'vector_lineweight_profile')
require File.join(CORE, 'layout_export_plan_builder')

class LayoutPresetRuntime
  attr_reader :drawing_view_presets

  def initialize
    @drawing_view_presets = JiraNot::ConstructFlow::Core::DrawingViewPresetRegistry.new
    JiraNot::ConstructFlow::Core::DrawingViewPresetRegistration.install(@drawing_view_presets)
  end
end

class LayoutExportPlanBuilderTest < Minitest::Test
  def test_builds_a3_landscape_vector_sheet_from_plumbing_preset
    plan = JiraNot::ConstructFlow::Core::LayoutExportPlanBuilder.new(runtime: LayoutPresetRuntime.new)
                                                                  .build_for_preset('plumbing.construction')

    assert_equal 'constructflow.layout_export_plan.v1', plan['format']
    assert_equal 'plumbing.construction', plan.dig('source', 'preset_id')
    assert_equal '1:50', plan.dig('source', 'scale')
    assert_equal 'P-101', plan.dig('sheet', 'number')
    assert_equal 'A3', plan.dig('sheet', 'paper_size')
    assert_equal 'landscape', plan.dig('sheet', 'orientation')
    assert_equal [420.0, 297.0], plan.dig('sheet', 'page_size_mm')
    assert_equal 'vector', plan.dig('sheet', 'viewports', 0, 'render_mode')
    assert_equal '1:50', plan.dig('sheet', 'viewports', 0, 'scale')
    assert_equal 0.35, plan.dig('vector_style', 'weights_mm', 'strong')
    assert_equal 'planned', plan['native_layout_status']
  end

  def test_supports_custom_sheet_identity_and_revision
    plan = JiraNot::ConstructFlow::Core::LayoutExportPlanBuilder.new(runtime: LayoutPresetRuntime.new)
                                                                  .build_for_preset(
                                                                    'plumbing.simple',
                                                                    sheet_id: 'sheet.plumbing.001',
                                                                    sheet_number: 'P-001',
                                                                    sheet_title: 'Drainage Overview',
                                                                    revision: 'A02',
                                                                    issue_status: 'issued'
                                                                  )

    assert_equal 'sheet.plumbing.001', plan.dig('sheet', 'id')
    assert_equal 'P-001', plan.dig('sheet', 'number')
    assert_equal 'Drainage Overview', plan.dig('sheet', 'title')
    assert_equal 'A02', plan.dig('sheet', 'revision')
    assert_equal 'issued', plan.dig('sheet', 'issue_status')
  end

  def test_viewport_rejects_non_positive_bounds
    assert_raises(ArgumentError) do
      JiraNot::ConstructFlow::Core::DrawingViewportSpec.new(
        id: 'vp-1', scene_name: 'Scene', preset_id: 'preset', scale: '1:50', bounds_mm: [0, 0, 0, 100]
      )
    end
  end

  def test_lineweight_profile_falls_back_to_normal_for_unknown_key
    profile = JiraNot::ConstructFlow::Core::VectorLineweightProfile.new
    assert_equal 0.18, profile.width_mm('unknown')
  end
end
