# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'layout_template_registry')
require File.join(CORE, 'native_layout_export_service')

class ExportServicePresetRegistry
  Preset = Struct.new(:drawing_family)
  def fetch!(_id) = Preset.new('plumbing_drainage_plan')
end

class ExportServicePlanBuilder
  attr_reader :last_options
  def build_for_preset(preset_id, **options)
    @last_options = options
    {
      'format' => 'constructflow.layout_export_plan.v1',
      'source' => { 'preset_id' => preset_id },
      'sheet' => { 'id' => 'sheet', 'number' => 'P-101', 'page_size_mm' => [420, 297], 'viewports' => [{}] }
    }
  end
end

class ExportServiceAdapter
  attr_reader :last_build
  def build(**options)
    @last_build = options
    { 'status' => 'created' }
  end
end

class ExportServiceRuntime
  attr_reader :drawing_view_presets, :layout_export_plans, :layout_templates
  def initialize(registry)
    @drawing_view_presets = ExportServicePresetRegistry.new
    @layout_export_plans = ExportServicePlanBuilder.new
    @layout_templates = registry
  end
end

class NativeLayoutExportServiceTest < Minitest::Test
  def test_resolves_registered_template_and_reports_version
    registry = JiraNot::ConstructFlow::Core::LayoutTemplateRegistry.new
    registry.register(
      JiraNot::ConstructFlow::Core::LayoutTemplateAsset.new(
        key: 'company.a3', version: '2026.09', path: '/templates/company-a3.layout',
        paper_size: 'A3', orientation: 'landscape', drawing_families: ['plumbing_drainage_plan']
      )
    )
    runtime = ExportServiceRuntime.new(registry)
    adapter = ExportServiceAdapter.new
    service = JiraNot::ConstructFlow::Core::NativeLayoutExportService.new(runtime: runtime, adapter: adapter)

    result = service.export_preset(
      'plumbing.construction', layout_path: '/out/P-101.layout', skp_path: '/model/project.skp',
      template_key: 'company.a3'
    )

    assert_equal '/templates/company-a3.layout', adapter.last_build[:template_path]
    assert_equal 'company.a3@2026.09', result['template_identity']
    assert_equal '2026.09', result['template_version']
  end

  def test_explicit_template_path_overrides_registry
    registry = JiraNot::ConstructFlow::Core::LayoutTemplateRegistry.new
    runtime = ExportServiceRuntime.new(registry)
    adapter = ExportServiceAdapter.new
    service = JiraNot::ConstructFlow::Core::NativeLayoutExportService.new(runtime: runtime, adapter: adapter)

    result = service.export_preset(
      'plumbing.construction', layout_path: '/out/P-101.layout', skp_path: '/model/project.skp',
      template_path: '/manual/template.layout', template_key: 'missing.key'
    )

    assert_equal '/manual/template.layout', adapter.last_build[:template_path]
    assert_nil result['template_identity']
  end
end
