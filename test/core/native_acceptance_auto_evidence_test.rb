# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_evidence_store')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_preflight')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_service')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_auto_evidence')

AutoEvidenceNamed = Struct.new(:name)
AutoEvidenceObject = Struct.new(:id)
AutoEvidenceProject = Struct.new(:project_id)

class AutoEvidenceModel < FakeModel
  attr_accessor :path
  attr_reader :pages, :layers

  def initialize(path:)
    super([])
    @path = path
    @pages = [AutoEvidenceNamed.new('ConstructFlow - Architecture Plan - Construction')]
    @layers = [AutoEvidenceNamed.new('CF-DRAWING-ARCHITECTURE-CONSTRUCTION')]
  end
end

class AutoEvidenceSmartObjects
  attr_accessor :objects

  def initialize(ids)
    @objects = ids.map { |id| AutoEvidenceObject.new(id) }
  end

  def all
    objects
  end

  def fetch_by_id(id)
    objects.find { |object| object.id.to_s == id.to_s }
  end
end

AutoEvidenceRuntime = Struct.new(:active_model, :project, :smart_objects, :events, :diagnostics)

class NativeAcceptanceAutoEvidenceTest < Minitest::Test
  def build_runtime(path: '/projects/acceptance.skp', project_id: 'project-1', ids: %w[ext-1 wall-1])
    AutoEvidenceRuntime.new(
      AutoEvidenceModel.new(path: path),
      AutoEvidenceProject.new(project_id),
      AutoEvidenceSmartObjects.new(ids),
      JiraNot::ConstructFlow::Core::EventBus.new,
      JiraNot::ConstructFlow::Core::DiagnosticLog.new
    )
  end

  def install(runtime)
    service = JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(runtime: runtime, session_token: 'runtime-a')
    collector = JiraNot::ConstructFlow::Core::NativeAcceptanceAutoEvidence.new(runtime: runtime, service: service).install
    [service, collector]
  end

  def publish(runtime, name, payload)
    runtime.events.publish(name, payload, source_module: 'constructflow.core')
  end

  def test_native_copy_checkpoint_passes_only_after_runtime_repair_event_with_live_ids
    runtime = build_runtime(ids: %w[ext-1 wall-1])
    service, = install(runtime)
    service.capture_baseline(extension_id: 'ext-1')
    runtime.smart_objects.objects << AutoEvidenceObject.new('wall-copy-1')

    publish(
      runtime,
      'NativeCopyIdentityRepaired',
      repairs: [{
        'source_object_id' => 'wall-1',
        'new_object_id' => 'wall-copy-1',
        'object_type' => 'architecture.wall',
        'relationships_detached' => true
      }]
    )

    checkpoint = service.summary.dig('checkpoints', 'native_copy_identity')
    assert_equal 'passed', checkpoint['status']
    assert_equal 'native_runtime_event', checkpoint.dig('evidence', 'evidence_source')
    assert_equal 'wall-1', checkpoint.dig('evidence', 'repairs', 0, 'source_object_id')
    assert_equal 'wall-copy-1', checkpoint.dig('evidence', 'repairs', 0, 'new_object_id')
  end

  def test_copy_event_without_acceptance_baseline_does_not_pass_checkpoint
    runtime = build_runtime(ids: %w[wall-1 wall-copy-1])
    service, = install(runtime)

    publish(
      runtime,
      'NativeCopyIdentityRepaired',
      repairs: [{
        'source_object_id' => 'wall-1',
        'new_object_id' => 'wall-copy-1',
        'relationships_detached' => true
      }]
    )

    assert_equal 'pending', service.summary.dig('checkpoints', 'native_copy_identity', 'status')
  end

  def test_invalid_copy_evidence_does_not_pass_checkpoint
    runtime = build_runtime(ids: %w[wall-1])
    service, = install(runtime)
    service.capture_baseline

    publish(
      runtime,
      'NativeCopyIdentityRepaired',
      repairs: [{
        'source_object_id' => 'wall-1',
        'new_object_id' => 'missing-copy',
        'relationships_detached' => true
      }]
    )

    assert_equal 'pending', service.summary.dig('checkpoints', 'native_copy_identity', 'status')
  end

  def test_observer_checkpoint_requires_native_new_then_open_back_to_armed_acceptance_target
    runtime = build_runtime
    acceptance_model = runtime.active_model
    acceptance_project = runtime.project
    acceptance_objects = runtime.smart_objects
    service, = install(runtime)
    service.capture_baseline(extension_id: 'ext-1')

    runtime.active_model = AutoEvidenceModel.new(path: '')
    runtime.project = AutoEvidenceProject.new('project-new')
    runtime.smart_objects = AutoEvidenceSmartObjects.new([])
    publish(
      runtime,
      'SketchupModelAttached',
      source: 'app_observer', transition: 'new', model_path: '', project_id: 'project-new', smart_object_count: 0
    )
    assert_equal 'pending', service.summary.dig('checkpoints', 'observer_new_open', 'status')

    runtime.active_model = acceptance_model
    runtime.project = acceptance_project
    runtime.smart_objects = acceptance_objects
    publish(
      runtime,
      'SketchupModelAttached',
      source: 'app_observer', transition: 'open', model_path: '/projects/acceptance.skp',
      project_id: 'project-1', smart_object_count: 2
    )

    checkpoint = service.summary.dig('checkpoints', 'observer_new_open')
    assert_equal 'passed', checkpoint['status']
    assert_equal 'new', checkpoint.dig('evidence', 'new_model', 'transition')
    assert_equal 'open', checkpoint.dig('evidence', 'reopened_model', 'transition')
    assert_equal 'native_runtime_event', checkpoint.dig('evidence', 'evidence_source')
  end

  def test_open_without_prior_new_transition_does_not_pass_observer_checkpoint
    runtime = build_runtime
    service, = install(runtime)
    service.capture_baseline

    publish(
      runtime,
      'SketchupModelAttached',
      source: 'app_observer', transition: 'open', model_path: '/projects/acceptance.skp',
      project_id: 'project-1', smart_object_count: 2
    )

    assert_equal 'pending', service.summary.dig('checkpoints', 'observer_new_open', 'status')
  end
end
