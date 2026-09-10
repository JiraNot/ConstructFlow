# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'drawing_issue_set')
require File.join(CORE, 'drawing_issue_set_builder')

class FakeIssueLayoutPlans
  attr_reader :calls

  def initialize
    @calls = []
  end

  def build_for_preset(preset_id, **options)
    @calls << [preset_id, options]
    { 'format' => 'constructflow.layout_export_plan.v1', 'source' => { 'preset_id' => preset_id }, 'sheet' => { 'number' => options[:sheet_number] } }
  end
end

class FakeIssueRuntime
  attr_reader :layout_export_plans

  def initialize
    @layout_export_plans = FakeIssueLayoutPlans.new
  end
end

class DrawingIssueSetTest < Minitest::Test
  def test_builds_multiple_sheet_plans_with_shared_revision_and_status
    issue_set = JiraNot::ConstructFlow::Core::DrawingIssueSet.new(
      id: 'issue.2026-09-10',
      name: 'Construction Issue',
      revision: 'A03',
      issue_status: 'issued',
      template_scope_id: 'project-001',
      sheets: [
        JiraNot::ConstructFlow::Core::DrawingIssueSheetRequest.new(
          preset_id: 'plumbing.construction', options: { sheet_number: 'P-101' }
        ),
        JiraNot::ConstructFlow::Core::DrawingIssueSheetRequest.new(
          preset_id: 'plumbing.coordination', options: { sheet_number: 'P-102' }
        )
      ]
    )
    runtime = FakeIssueRuntime.new
    result = JiraNot::ConstructFlow::Core::DrawingIssueSetBuilder.new(runtime: runtime).build(issue_set)

    assert_equal 'constructflow.drawing_issue_set.v1', result['format']
    assert_equal 2, result['sheet_count']
    assert_equal 'A03', runtime.layout_export_plans.calls[0][1][:revision]
    assert_equal 'issued', runtime.layout_export_plans.calls[1][1][:issue_status]
    assert_equal 'P-101', result.dig('sheet_plans', 0, 'sheet', 'number')
    assert_equal 'project-001', result['template_scope_id']
  end

  def test_requires_at_least_one_sheet
    assert_raises(ArgumentError) do
      JiraNot::ConstructFlow::Core::DrawingIssueSet.new(
        id: 'issue.empty', name: 'Empty', revision: 'P01', issue_status: 'working', sheets: []
      )
    end
  end
end
