# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'drawing_view_preset_registry')
require File.join(CORE, 'drawing_view_preset_registration')
require File.join(CORE, 'drawing_sheet_spec')
require File.join(CORE, 'drawing_sheet_metadata')
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
    assert_equal 'P-101', plan.dig('sheet', 'title_block', 'fields', 'sheet_number')
    assert_equal '1:50', plan.dig('sheet', 'title_block', 'fields', 'scale')
    assert_equal 'P01', plan.dig('sheet', 'revisions', 0, 'code')
    assert_equal '{{CF:PROJECT_NAME}}', plan.dig('sheet', 'title_block', 'placeholder_map', 'field_tokens', 'project_name')
    assert_equal 'prefer_template', plan.dig('sheet', 'title_block', 'placeholder_map', 'strategy')
  end

  def test_supports_custom_sheet_identity_revision_and_project_metadata
    plan = JiraNot::ConstructFlow::Core::LayoutExportPlanBuilder.new(runtime: LayoutPresetRuntime.new)
                                                                  .build_for_preset(
                                                                    'plumbing.simple',
                                                                    sheet_id: 'sheet.plumbing.001',
                                                                    sheet_number: 'P-001',
                                                                    sheet_title: 'Drainage Overview',
                                                                    revision: 'A02',
                                                                    issue_status: 'issued',
                                                                    project_name: 'House Renovation',
                                                                    project_number: 'CF-001',
                                                                    drawn_by: 'NN',
                                                                    checked_by: 'PA',
                                                                    revisions: [
                                                                      { code: 'A01', description: 'For review', date: '2026-09-01', status: 'review', author: 'NN' },
                                                                      { code: 'A02', description: 'Issued', date: '2026-09-10', status: 'issued', author: 'NN' }
                                                                    ]
                                                                  )

    assert_equal 'sheet.plumbing.001', plan.dig('sheet', 'id')
    assert_equal 'P-001', plan.dig('sheet', 'number')
    assert_equal 'Drainage Overview', plan.dig('sheet', 'title')
    assert_equal 'A02', plan.dig('sheet', 'revision')
    assert_equal 'issued', plan.dig('sheet', 'issue_status')
    assert_equal 'House Renovation', plan.dig('sheet', 'title_block', 'fields', 'project_name')
    assert_equal 'CF-001', plan.dig('sheet', 'title_block', 'fields', 'project_number')
    assert_equal 2, plan.dig('sheet', 'revisions').length
    assert_equal 'Issued', plan.dig('sheet', 'revisions', 1, 'description')
  end

  def test_supports_company_specific_placeholder_tokens_and_template_only_mode
    plan = JiraNot::ConstructFlow::Core::LayoutExportPlanBuilder.new(runtime: LayoutPresetRuntime.new)
                                                                  .build_for_preset(
                                                                    'plumbing.construction',
                                                                    template_key: 'company.a3',
                                                                    placeholder_tokens: {
                                                                      project_name: '<PROJECT>',
                                                                      sheet_number: '<SHEET>'
                                                                    },
                                                                    template_strategy: 'template_only',
                                                                    revision_placeholder_prefix: 'COMPANY:REV'
                                                                  )

    assert_equal 'company.a3', plan.dig('sheet', 'title_block', 'placeholder_map', 'template_key')
    assert_equal '<PROJECT>', plan.dig('sheet', 'title_block', 'placeholder_map', 'field_tokens', 'project_name')
    assert_equal '<SHEET>', plan.dig('sheet', 'title_block', 'placeholder_map', 'field_tokens', 'sheet_number')
    assert_equal 'template_only', plan.dig('sheet', 'title_block', 'placeholder_map', 'strategy')
    assert_equal 'COMPANY:REV', plan.dig('sheet', 'title_block', 'placeholder_map', 'revision_prefix')
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
