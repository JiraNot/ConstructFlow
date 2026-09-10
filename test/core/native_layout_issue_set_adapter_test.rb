# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'drawing_issue_set')
require File.join(CORE, 'native_layout_issue_set_adapter')

class IssueSetFakePage < FakeAttributeCarrier
  attr_accessor :name
end

class IssueSetFakeDocument < FakeAttributeCarrier
  attr_reader :saved, :exported

  def initialize
    super
    @saved = []
    @exported = []
  end
end

class IssueSetFakeBackend
  attr_reader :calls, :document, :pages

  def initialize
    @calls = []
    @document = IssueSetFakeDocument.new
    @pages = [IssueSetFakePage.new]
  end

  def name = 'fake_issue_layout'
  def create_document(template_path: nil) = (@calls << [:create_document, template_path]; @document)
  def configure_page(_document, width_in:, height_in:) = (@calls << [:configure_page, width_in, height_in])
  def first_page(_document) = @pages.first
  def first_layer(_document) = :layer
  def add_page(_document, name = nil) = (page = IssueSetFakePage.new; page.name = name; @pages << page; @calls << [:add_page, name]; page)
  def name_page(page, name) = (page.name = name)
  def bounds2d(x, y, width, height) = [x, y, width, height]
  def create_sketchup_model(path, bounds) = Struct.new(:path, :bounds).new(path, bounds)
  def select_scene(_model, name) = (@calls << [:select_scene, name])
  def set_render_mode(_model, mode) = (@calls << [:render_mode, mode])
  def set_scale(_model, scale) = (@calls << [:scale, scale])
  def add_entity(_document, _entity, _layer, page) = (@calls << [:add_entity, page.object_id])
  def render(_model) = nil
  def save(document, path) = document.saved << path
  def export_pdf(document, path) = document.exported << path
  def template_text_entities(_document, _page) = []
  def create_rectangle(bounds) = { type: 'rectangle', bounds: bounds }
  def create_text(text, bounds) = { type: 'text', text: text, bounds: bounds }
end

class NativeLayoutIssueSetAdapterTest < Minitest::Test
  def sheet_plan(number, preset)
    {
      'format' => 'constructflow.layout_export_plan.v1',
      'source' => { 'preset_id' => preset, 'drawing_family' => 'plumbing_drainage_plan' },
      'sheet' => {
        'id' => "sheet.#{number}", 'number' => number, 'title' => "Sheet #{number}",
        'paper_size' => 'A3', 'orientation' => 'landscape', 'page_size_mm' => [420.0, 297.0],
        'revision' => 'A01', 'issue_status' => 'issued',
        'title_block' => {}, 'revisions' => [],
        'viewports' => [
          { 'scene_name' => "Scene #{number}", 'scale' => '1:50', 'bounds_mm' => [15, 15, 390, 238], 'render_mode' => 'vector' }
        ]
      }
    }
  end

  def issue_plan
    {
      'format' => 'constructflow.drawing_issue_set.v1',
      'id' => 'issue-001', 'name' => 'Construction Issue', 'revision' => 'A01', 'issue_status' => 'issued',
      'sheet_plans' => [sheet_plan('P-101', 'plumbing.construction'), sheet_plan('P-102', 'plumbing.coordination')]
    }
  end

  def test_creates_one_native_document_with_multiple_pages
    backend = IssueSetFakeBackend.new
    result = JiraNot::ConstructFlow::Core::NativeLayoutIssueSetAdapter.new(backend: backend).build(
      issue_plan: issue_plan, skp_path: '/project/model.skp', layout_path: '/project/issue.layout', pdf_path: '/project/issue.pdf'
    )

    assert_equal 'created', result['status']
    assert_equal 2, result['sheet_count']
    assert_equal 2, backend.pages.length
    assert_equal 'P-101 - Sheet P-101', backend.pages[0].name
    assert_equal 'P-102 - Sheet P-102', backend.pages[1].name
    assert_equal ['/project/issue.layout'], backend.document.saved
    assert_equal ['/project/issue.pdf'], backend.document.exported
    assert_equal 2, backend.document.get_attribute('constructflow.issue_set', 'sheet_count')
    assert_in_delta 0.02, backend.calls.find { |call| call.first == :scale }[1], 0.000001
  end

  def test_rejects_mixed_page_sizes_in_one_native_document
    plan = issue_plan
    plan['sheet_plans'][1]['sheet']['page_size_mm'] = [841.0, 594.0]
    adapter = JiraNot::ConstructFlow::Core::NativeLayoutIssueSetAdapter.new(backend: IssueSetFakeBackend.new)
    assert_raises(ArgumentError) do
      adapter.build(issue_plan: plan, skp_path: 'model.skp', layout_path: 'issue.layout')
    end
  end
end
