# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_evidence_store')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_service')

NativeAcceptanceNamed = Struct.new(:name)
NativeAcceptanceObject = Struct.new(:id)
NativeAcceptanceProject = Struct.new(:project_id)

class NativeAcceptanceModel < FakeModel
  attr_accessor :path
  attr_reader :pages, :layers

  def initialize(path:, pages: [], layers: [])
    super([])
    @path = path
    @pages = pages.map { |name| NativeAcceptanceNamed.new(name) }
    @layers = layers.map { |name| NativeAcceptanceNamed.new(name) }
  end
end

class NativeAcceptanceSmartObjects
  attr_accessor :objects

  def initialize(ids)
    @objects = ids.map { |id| NativeAcceptanceObject.new(id) }
  end

  def all
    objects
  end
end

NativeAcceptanceRuntime = Struct.new(:active_model, :project, :smart_objects)

class NativeAcceptanceEvidenceStoreTest < Minitest::Test
  def runtime
    model = NativeAcceptanceModel.new(
      path: '/projects/extension.skp',
      pages: ['ConstructFlow - Architecture Plan - Construction', 'User Perspective'],
      layers: ['CF-DRAWING-ARCHITECTURE-CONSTRUCTION', 'CF-STYLE-FOREGROUND-SOLID-STRONG', 'SITE-TREES']
    )
    NativeAcceptanceRuntime.new(
      model,
      NativeAcceptanceProject.new('project-1'),
      NativeAcceptanceSmartObjects.new(%w[ext-1 wall-1 roof-1])
    )
  end

  def copy_acceptance_attributes(from:, to:)
    dictionary = JiraNot::ConstructFlow::Core::NativeAcceptanceEvidenceStore::DICTIONARY
    key = JiraNot::ConstructFlow::Core::NativeAcceptanceEvidenceStore::KEY
    raw = from.get_attribute(dictionary, key, nil)
    to.set_attribute(dictionary, key, raw)
  end

  def test_capture_persists_deterministic_baseline_and_requires_real_session_change_before_verification
    current_runtime = runtime
    service = JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(
      runtime: current_runtime,
      session_token: 'runtime-a'
    )

    baseline = service.capture_baseline(extension_id: 'ext-1')

    assert_equal 'ext-1', baseline['extension_id']
    assert_equal %w[ext-1 roof-1 wall-1], baseline.dig('baseline', 'smart_object_ids')
    refute_empty baseline['baseline_fingerprint']

    verification = service.verify_reopen
    assert_equal 'requires_reopen', verification['status']
    refute verification['passed']
    assert_equal 'pending', service.summary.dig('checkpoints', 'save_reopen_identity', 'status')
  end

  def test_new_runtime_session_passes_when_semantic_ids_and_managed_drawing_state_survive
    current_runtime = runtime
    JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(
      runtime: current_runtime,
      session_token: 'runtime-a'
    ).capture_baseline(extension_id: 'ext-1')

    reopened = JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(
      runtime: current_runtime,
      session_token: 'runtime-b'
    )
    result = reopened.verify_reopen

    assert_equal 'passed', result['status']
    assert result['passed']
    assert_empty result['differences']
    assert_equal 'passed', reopened.summary.dig('checkpoints', 'save_reopen_identity', 'status')
  end

  def test_same_sketchup_process_can_verify_after_model_object_is_reopened
    current_runtime = runtime
    service = JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(
      runtime: current_runtime,
      session_token: 'runtime-a'
    )
    service.capture_baseline(extension_id: 'ext-1')

    reopened_model = NativeAcceptanceModel.new(
      path: '/projects/extension.skp',
      pages: ['ConstructFlow - Architecture Plan - Construction', 'User Perspective'],
      layers: ['CF-DRAWING-ARCHITECTURE-CONSTRUCTION', 'CF-STYLE-FOREGROUND-SOLID-STRONG', 'SITE-TREES']
    )
    copy_acceptance_attributes(from: current_runtime.active_model, to: reopened_model)
    current_runtime.active_model = reopened_model

    result = service.verify_reopen

    assert_equal 'passed', result['status']
    assert result['passed']
  end

  def test_reopen_verification_fails_when_a_smart_object_id_is_missing
    current_runtime = runtime
    JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(
      runtime: current_runtime,
      session_token: 'runtime-a'
    ).capture_baseline
    current_runtime.smart_objects.objects.reject! { |object| object.id == 'wall-1' }

    result = JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(
      runtime: current_runtime,
      session_token: 'runtime-b'
    ).verify_reopen

    assert_equal 'failed', result['status']
    assert_equal ['wall-1'], result.dig('differences', 'smart_object_ids', 'missing')
  end

  def test_extra_user_scenes_and_tags_do_not_invalidate_managed_baseline
    current_runtime = runtime
    JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(
      runtime: current_runtime,
      session_token: 'runtime-a'
    ).capture_baseline
    current_runtime.active_model.pages << NativeAcceptanceNamed.new('Later User Scene')
    current_runtime.active_model.layers << NativeAcceptanceNamed.new('CLIENT-NOTES')

    result = JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(
      runtime: current_runtime,
      session_token: 'runtime-b'
    ).verify_reopen

    assert_equal 'passed', result['status']
  end

  def test_all_required_manual_and_automatic_checkpoints_must_pass_before_complete
    current_runtime = runtime
    service = JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(
      runtime: current_runtime,
      session_token: 'runtime-a'
    )
    service.capture_baseline
    JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(
      runtime: current_runtime,
      session_token: 'runtime-b'
    ).verify_reopen

    remaining = JiraNot::ConstructFlow::Core::NativeAcceptanceEvidenceStore::REQUIRED_CHECKPOINTS - ['save_reopen_identity']
    remaining.each do |checkpoint_id|
      service.record_checkpoint(
        checkpoint_id: checkpoint_id,
        status: 'passed',
        notes: 'verified in supported native application',
        evidence: { application: 'SketchUp/LayOut', verified: true }
      )
    end

    summary = service.summary
    assert summary['complete']
    assert_equal JiraNot::ConstructFlow::Core::NativeAcceptanceEvidenceStore::REQUIRED_CHECKPOINTS.sort,
                 summary['passed'].sort
  end

  def test_unsaved_model_cannot_capture_save_reopen_baseline
    current_runtime = runtime
    current_runtime.active_model.path = ''
    service = JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(runtime: current_runtime, session_token: 'runtime-a')

    error = assert_raises(ArgumentError) { service.capture_baseline }
    assert_includes error.message, 'save the SketchUp model'
  end
end
