# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'native_layout_adapter')

class FakeNativeLayoutDocument < FakeAttributeCarrier
  attr_reader :saved_paths, :exported_paths

  def initialize
    super
    @saved_paths = []
    @exported_paths = []
  end
end

class FakeNativeLayoutBackend
  attr_reader :calls, :document

  def initialize
    @calls = []
    @document = FakeNativeLayoutDocument.new
  end

  def name = 'fake_layout'

  def create_document(template_path: nil)
    @calls << [:create_document, template_path]
    @document
  end

  def configure_page(document, width_in:, height_in:)
    @calls << [:configure_page, width_in, height_in]
  end

  def first_page(document)
    @calls << [:first_page]
    :page
  end

  def first_layer(document)
    @calls << [:first_layer]
    :layer
  end

  def bounds2d(x, y, width, height)
    bounds = [x, y, width, height]
    @calls << [:bounds2d, *bounds]
    bounds
  end

  def create_sketchup_model(path, bounds)
    model = Struct.new(:path, :bounds).new(path, bounds)
    @calls << [:create_sketchup_model, path, bounds]
    model
  end

  def select_scene(model, scene_name)
    @calls << [:select_scene, scene_name]
  end

  def set_render_mode(model, mode)
    @calls << [:set_render_mode, mode]
  end

  def set_scale(model, scale)
    @calls << [:set_scale, scale]
  end

  def add_entity(document, entity, layer, page)
    @calls << [:add_entity, layer, page]
  end

  def render(model)
    @calls << [:render]
  end

  def save(document, path)
    document.saved_paths << path
    @calls << [:save, path]
  end

  def export_pdf(document, path)
    document.exported_paths << path
    @calls << [:export_pdf, path]
  end
end

class NativeLayoutAdapterTest < Minitest::Test
  def export_plan
    {
      'format' => 'constructflow.layout_export_plan.v1',
      'source' => {
        'preset_id' => 'plumbing.construction',
        'scene_name' => 'ConstructFlow - Plumbing Plan - Construction'
      },
      'sheet' => {
        'id' => 'sheet.plumbing.construction',
        'number' => 'P-101',
        'title' => 'Plumbing Plan - Construction',
        'revision' => 'P01',
        'issue_status' => 'working',
        'page_size_mm' => [420.0, 297.0],
        'viewports' => [
          {
            'id' => 'viewport.plumbing.construction',
            'scene_name' => 'ConstructFlow - Plumbing Plan - Construction',
            'preset_id' => 'plumbing.construction',
            'scale' => '1:50',
            'bounds_mm' => [15.0, 15.0, 390.0, 255.0],
            'render_mode' => 'vector',
            'lineweight_profile' => 'construction'
          }
        ]
      }
    }
  end

  def test_builds_native_document_viewport_and_pdf_from_normalized_plan
    backend = FakeNativeLayoutBackend.new
    result = JiraNot::ConstructFlow::Core::NativeLayoutAdapter.new(backend: backend).build(
      export_plan: export_plan,
      skp_path: '/project/model.skp',
      layout_path: '/project/P-101.layout',
      pdf_path: '/project/P-101.pdf',
      template_path: '/templates/company.layout'
    )

    assert_equal 'created', result['status']
    assert_equal 1, result['viewport_count']
    assert_equal 'fake_layout', result['native_backend']
    assert backend.calls.include?([:select_scene, 'ConstructFlow - Plumbing Plan - Construction'])
    assert backend.calls.include?([:set_render_mode, 'vector'])
    scale_call = backend.calls.find { |item| item.first == :set_scale }
    assert_in_delta 0.02, scale_call[1], 0.000001
    assert_equal ['/project/P-101.layout'], backend.document.saved_paths
    assert_equal ['/project/P-101.pdf'], backend.document.exported_paths
    assert_equal 'P-101', backend.document.get_attribute('constructflow.layout_export', 'sheet_number')
    assert_equal 'plumbing.construction', backend.document.get_attribute('constructflow.layout_export', 'preset_id')
  end

  def test_converts_sheet_and_viewport_millimetres_to_inches
    backend = FakeNativeLayoutBackend.new
    JiraNot::ConstructFlow::Core::NativeLayoutAdapter.new(backend: backend).build(
      export_plan: export_plan,
      skp_path: 'model.skp',
      layout_path: 'P-101.layout'
    )

    page_call = backend.calls.find { |item| item.first == :configure_page }
    assert_in_delta 420.0 / 25.4, page_call[1], 0.000001
    assert_in_delta 297.0 / 25.4, page_call[2], 0.000001

    bounds_call = backend.calls.find { |item| item.first == :bounds2d }
    assert_in_delta 15.0 / 25.4, bounds_call[1], 0.000001
    assert_in_delta 390.0 / 25.4, bounds_call[3], 0.000001
  end

  def test_rejects_invalid_plan_and_output_extensions
    adapter = JiraNot::ConstructFlow::Core::NativeLayoutAdapter.new(backend: FakeNativeLayoutBackend.new)
    assert_raises(ArgumentError) do
      adapter.build(export_plan: {}, skp_path: 'model.skp', layout_path: 'sheet.layout')
    end
    assert_raises(ArgumentError) do
      adapter.build(export_plan: export_plan, skp_path: 'model.skp', layout_path: 'sheet.pdf')
    end
  end
end
