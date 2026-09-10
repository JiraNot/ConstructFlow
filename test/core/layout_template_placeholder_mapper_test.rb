# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'layout_template_placeholder_map')
require File.join(CORE, 'native_layout_template_placeholder_mapper')

class TemplatePlaceholderText
  attr_accessor :plain_text

  def initialize(text, locked: false)
    @plain_text = text
    @locked = locked
  end

  def locked?
    @locked
  end
end

class TemplatePlaceholderBackend
  attr_reader :entities

  def initialize(*entities)
    @entities = entities
  end

  def template_text_entities(_document, _page)
    entities
  end

  def text_plain_text(entity)
    entity.plain_text
  end

  def set_text_plain_text(entity, value)
    entity.plain_text = value
  end

  def entity_locked?(entity)
    entity.locked?
  end
end

class LayoutTemplatePlaceholderMapperTest < Minitest::Test
  def placeholder_map(strategy: 'prefer_template')
    JiraNot::ConstructFlow::Core::LayoutTemplatePlaceholderMap.new(
      template_key: 'company.a3',
      strategy: strategy
    ).to_h
  end

  def title_block(strategy: 'prefer_template')
    {
      'fields' => {
        'project_name' => 'Residence A',
        'project_number' => '',
        'drawing_title' => 'Plumbing Plan',
        'sheet_number' => 'P-101',
        'scale' => '1:50',
        'revision' => 'A01',
        'issue_status' => 'issued',
        'drawn_by' => '',
        'checked_by' => '',
        'drawing_family' => 'plumbing_drainage_plan'
      },
      'placeholder_map' => placeholder_map(strategy: strategy)
    }
  end

  def test_replaces_only_exact_non_empty_template_tokens
    project = TemplatePlaceholderText.new('{{CF:PROJECT_NAME}}')
    sheet = TemplatePlaceholderText.new('{{CF:SHEET_NUMBER}}')
    empty_project_number = TemplatePlaceholderText.new('{{CF:PROJECT_NUMBER}}')
    unrelated = TemplatePlaceholderText.new('Company Address')
    partial = TemplatePlaceholderText.new('Project {{CF:PROJECT_NAME}}')
    backend = TemplatePlaceholderBackend.new(project, sheet, empty_project_number, unrelated, partial)

    result = JiraNot::ConstructFlow::Core::NativeLayoutTemplatePlaceholderMapper.new(backend: backend).apply(
      document: Object.new,
      page: Object.new,
      title_block: title_block,
      revisions: []
    )

    assert_equal 'Residence A', project.plain_text
    assert_equal 'P-101', sheet.plain_text
    assert_equal '{{CF:PROJECT_NUMBER}}', empty_project_number.plain_text
    assert_equal 'Company Address', unrelated.plain_text
    assert_equal 'Project {{CF:PROJECT_NAME}}', partial.plain_text
    assert_equal true, result['template_used']
    assert_includes result['matched_fields'], 'project_name'
    assert_includes result['matched_fields'], 'sheet_number'
    assert_includes result['skipped_empty_fields'], 'project_number'
  end

  def test_maps_indexed_revision_placeholders
    revision_code = TemplatePlaceholderText.new('{{CF:REV:1:CODE}}')
    revision_date = TemplatePlaceholderText.new('{{CF:REV:1:DATE}}')
    backend = TemplatePlaceholderBackend.new(revision_code, revision_date)

    result = JiraNot::ConstructFlow::Core::NativeLayoutTemplatePlaceholderMapper.new(backend: backend).apply(
      document: Object.new,
      page: Object.new,
      title_block: title_block,
      revisions: [{ 'code' => 'A02', 'date' => '2026-09-10', 'status' => 'issued', 'description' => 'Permit issue' }]
    )

    assert_equal 'A02', revision_code.plain_text
    assert_equal '2026-09-10', revision_date.plain_text
    assert_includes result['matched_fields'], 'revision.1.code'
    assert_includes result['matched_fields'], 'revision.1.date'
  end

  def test_generic_only_does_not_scan_or_mutate_template
    project = TemplatePlaceholderText.new('{{CF:PROJECT_NAME}}')
    backend = TemplatePlaceholderBackend.new(project)

    result = JiraNot::ConstructFlow::Core::NativeLayoutTemplatePlaceholderMapper.new(backend: backend).apply(
      document: Object.new,
      page: Object.new,
      title_block: title_block(strategy: 'generic_only'),
      revisions: []
    )

    assert_equal '{{CF:PROJECT_NAME}}', project.plain_text
    assert_equal false, result['template_used']
    assert_equal 0, result['matched_count']
  end
end
