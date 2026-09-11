# frozen_string_literal: true

require 'tmpdir'
require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_evidence_store')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_preflight')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_service')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_auto_evidence')

LayoutEvidenceObject = Struct.new(:id)
LayoutEvidenceProject = Struct.new(:project_id)

class LayoutEvidenceModel < FakeModel
  attr_accessor :path

  def initialize(path:)
    super([])
    @path = path
  end
end

class LayoutEvidenceSmartObjects
  def initialize(ids)
    @objects = ids.map { |id| LayoutEvidenceObject.new(id) }
  end

  def all
    @objects
  end

  def fetch_by_id(id)
    @objects.find { |object| object.id.to_s == id.to_s }
  end
end

LayoutEvidenceRuntime = Struct.new(:active_model, :project, :smart_objects, :events, :diagnostics)

class NativeAcceptanceLayoutEvidenceTest < Minitest::Test
  def build_runtime(model_path)
    LayoutEvidenceRuntime.new(
      LayoutEvidenceModel.new(path: model_path),
      LayoutEvidenceProject.new('project-1'),
      LayoutEvidenceSmartObjects.new(%w[ext-1 wall-1]),
      JiraNot::ConstructFlow::Core::EventBus.new,
      JiraNot::ConstructFlow::Core::DiagnosticLog.new
    )
  end

  def install(runtime)
    service = JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(runtime: runtime, session_token: 'runtime-a')
    JiraNot::ConstructFlow::Core::NativeAcceptanceAutoEvidence.new(runtime: runtime, service: service).install
    service.capture_baseline(extension_id: 'ext-1')
    service
  end

  def publish(runtime, payload)
    runtime.events.publish('NativeLayoutExportCompleted', payload, source_module: 'constructflow.drawing')
  end

  def valid_payload(dir, skp_path)
    template = File.join(dir, 'company-a3.layout')
    layout = File.join(dir, 'construction-set.layout')
    pdf = File.join(dir, 'construction-set.pdf')
    File.binwrite(template, 'template')
    File.binwrite(layout, 'layout-output')
    File.binwrite(pdf, '%PDF-native-output')

    {
      export_kind: 'issue_set',
      native_backend: 'layout_ruby_api',
      skp_path: skp_path,
      layout_path: layout,
      pdf_path: pdf,
      issue_set_id: 'construction.ext-1.P01',
      sheet_count: 7,
      viewport_count: 7,
      template_resolution: {
        source: 'registry',
        key: 'company.a3',
        version: '1.0.0',
        path: template,
        asset_verified: true,
        sha256: 'abc123'
      }
    }
  end

  def test_real_backend_event_with_existing_template_layout_and_pdf_passes_checkpoint
    Dir.mktmpdir do |dir|
      skp_path = File.join(dir, 'acceptance.skp')
      File.binwrite(skp_path, 'sketchup-model')
      runtime = build_runtime(skp_path)
      service = install(runtime)
      payload = valid_payload(dir, skp_path)

      publish(runtime, payload)

      checkpoint = service.summary.dig('checkpoints', 'layout_pdf_export')
      assert_equal 'passed', checkpoint['status']
      assert_equal 'native_runtime_event', checkpoint.dig('evidence', 'evidence_source')
      assert_equal 'layout_ruby_api', checkpoint.dig('evidence', 'native_backend')
      assert_operator checkpoint.dig('evidence', 'layout_bytes'), :>, 0
      assert_operator checkpoint.dig('evidence', 'pdf_bytes'), :>, 0
      assert_equal 'company.a3', checkpoint.dig('evidence', 'template_resolution', 'key')
    end
  end

  def test_fake_backend_never_passes_layout_checkpoint
    Dir.mktmpdir do |dir|
      skp_path = File.join(dir, 'acceptance.skp')
      File.binwrite(skp_path, 'sketchup-model')
      runtime = build_runtime(skp_path)
      service = install(runtime)
      payload = valid_payload(dir, skp_path)
      payload[:native_backend] = 'fake_layout_backend'

      publish(runtime, payload)

      assert_equal 'pending', service.summary.dig('checkpoints', 'layout_pdf_export', 'status')
    end
  end

  def test_missing_pdf_or_template_never_passes_layout_checkpoint
    Dir.mktmpdir do |dir|
      skp_path = File.join(dir, 'acceptance.skp')
      File.binwrite(skp_path, 'sketchup-model')
      runtime = build_runtime(skp_path)
      service = install(runtime)
      payload = valid_payload(dir, skp_path)
      File.delete(payload[:pdf_path])

      publish(runtime, payload)
      assert_equal 'pending', service.summary.dig('checkpoints', 'layout_pdf_export', 'status')

      payload = valid_payload(dir, skp_path)
      File.delete(payload.dig(:template_resolution, :path))
      publish(runtime, payload)
      assert_equal 'pending', service.summary.dig('checkpoints', 'layout_pdf_export', 'status')
    end
  end

  def test_export_for_other_skp_does_not_satisfy_armed_acceptance_project
    Dir.mktmpdir do |dir|
      skp_path = File.join(dir, 'acceptance.skp')
      File.binwrite(skp_path, 'sketchup-model')
      runtime = build_runtime(skp_path)
      service = install(runtime)
      payload = valid_payload(dir, File.join(dir, 'other.skp'))

      publish(runtime, payload)

      assert_equal 'pending', service.summary.dig('checkpoints', 'layout_pdf_export', 'status')
    end
  end
end
