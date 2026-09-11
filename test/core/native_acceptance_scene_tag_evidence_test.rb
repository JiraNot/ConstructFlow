# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_evidence_store')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_preflight')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_service')

SceneEvidencePoint = Struct.new(:x, :y, :z) do
  def to_a
    [x, y, z]
  end
end

class SceneEvidenceCamera
  attr_accessor :eye, :target, :up, :height

  def initialize(target_x: 0.0)
    @eye = SceneEvidencePoint.new(0.0, 0.0, 1000.0)
    @target = SceneEvidencePoint.new(target_x, 0.0, 0.0)
    @up = SceneEvidencePoint.new(0.0, 1.0, 0.0)
    @height = 8000.0
  end

  def perspective?
    false
  end
end

class SceneEvidencePage < FakeAttributeCarrier
  attr_reader :name, :camera

  def initialize(name:, camera: SceneEvidenceCamera.new, active_tag: 'CF-DRAWING-ARCHITECTURE-CONSTRUCTION')
    super()
    @name = name
    @camera = camera
    dictionary = JiraNot::ConstructFlow::Core::NativeAcceptanceEvidenceStore::SCENE_PRESENTATION_DICTIONARY
    set_attribute(dictionary, 'active_drawing_tag', active_tag)
    set_attribute(dictionary, 'managed_drawing_tags', 'CF-DRAWING-ARCHITECTURE-CONSTRUCTION')
    set_attribute(dictionary, 'managed_style_tags', 'CF-STYLE-FOREGROUND-SOLID-STRONG')
  end

  def use_camera?
    true
  end
end

SceneEvidenceLineStyle = Struct.new(:name)

class SceneEvidenceTag
  attr_reader :name, :color, :line_style
  attr_accessor :visible

  def initialize(name:, visible:, color: [40, 40, 40], line_style: '')
    @name = name
    @visible = visible
    @color = color
    @line_style = line_style.to_s.empty? ? nil : SceneEvidenceLineStyle.new(line_style)
  end

  def visible?
    !!visible
  end
end

class SceneEvidenceModel < FakeModel
  attr_accessor :path
  attr_reader :pages, :layers

  def initialize(path:, target_x: 0.0, site_visible: true)
    super([])
    @path = path
    @pages = [
      SceneEvidencePage.new(
        name: 'ConstructFlow - Architecture Plan - Construction',
        camera: SceneEvidenceCamera.new(target_x: target_x)
      ),
      SceneEvidencePage.new(name: 'User Perspective', active_tag: '')
    ]
    @layers = [
      SceneEvidenceTag.new(name: 'CF-DRAWING-ARCHITECTURE-CONSTRUCTION', visible: true),
      SceneEvidenceTag.new(name: 'CF-STYLE-FOREGROUND-SOLID-STRONG', visible: true, line_style: 'Solid'),
      SceneEvidenceTag.new(name: 'SITE-TREES', visible: site_visible, color: [10, 120, 10])
    ]
  end
end

SceneEvidenceObject = Struct.new(:id)
SceneEvidenceProject = Struct.new(:project_id)

class SceneEvidenceSmartObjects
  def initialize(ids)
    @objects = ids.map { |id| SceneEvidenceObject.new(id) }
  end

  def all
    @objects
  end
end

SceneEvidenceRuntime = Struct.new(:active_model, :project, :smart_objects)

class NativeAcceptanceSceneTagEvidenceTest < Minitest::Test
  def runtime(model)
    SceneEvidenceRuntime.new(
      model,
      SceneEvidenceProject.new('project-1'),
      SceneEvidenceSmartObjects.new(%w[ext-1 wall-1])
    )
  end

  def copy_acceptance_session(from:, to:)
    dictionary = JiraNot::ConstructFlow::Core::NativeAcceptanceEvidenceStore::DICTIONARY
    key = JiraNot::ConstructFlow::Core::NativeAcceptanceEvidenceStore::KEY
    to.set_attribute(dictionary, key, from.get_attribute(dictionary, key, nil))
  end

  def capture(model)
    value = runtime(model)
    service = JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(runtime: value, session_token: 'runtime-a')
    service.capture_baseline(extension_id: 'ext-1')
    [value, service]
  end

  def verify(runtime_value)
    JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(
      runtime: runtime_value,
      session_token: 'runtime-b'
    ).verify_reopen
  end

  def test_identical_native_scene_camera_and_tag_state_auto_passes_scene_tag_checkpoint
    original = SceneEvidenceModel.new(path: '/projects/acceptance.skp')
    runtime_value, = capture(original)
    reopened = SceneEvidenceModel.new(path: '/projects/acceptance.skp')
    copy_acceptance_session(from: original, to: reopened)
    runtime_value.active_model = reopened

    result = verify(runtime_value)
    checkpoint = JiraNot::ConstructFlow::Core::NativeAcceptanceEvidenceStore.new(reopened)
                 .summary.dig('checkpoints', 'scene_tag_persistence')

    assert result['passed']
    assert_empty result['presentation_differences']
    assert_equal 'passed', checkpoint['status']
    assert_equal 'native_reopen_snapshot', checkpoint.dig('evidence', 'evidence_source')
  end

  def test_unrelated_user_tag_visibility_change_fails_scene_tag_checkpoint_without_failing_identity
    original = SceneEvidenceModel.new(path: '/projects/acceptance.skp', site_visible: true)
    runtime_value, = capture(original)
    reopened = SceneEvidenceModel.new(path: '/projects/acceptance.skp', site_visible: false)
    copy_acceptance_session(from: original, to: reopened)
    runtime_value.active_model = reopened

    result = verify(runtime_value)
    checkpoint = JiraNot::ConstructFlow::Core::NativeAcceptanceEvidenceStore.new(reopened)
                 .summary.dig('checkpoints', 'scene_tag_persistence')

    assert result['passed'], 'identity/name persistence should remain valid'
    assert_equal 'failed', checkpoint['status']
    changed = checkpoint.dig('evidence', 'differences', 'tag_states', 'changed')
    assert changed.key?('SITE-TREES')
  end

  def test_managed_scene_camera_change_fails_scene_tag_checkpoint
    original = SceneEvidenceModel.new(path: '/projects/acceptance.skp', target_x: 0.0)
    runtime_value, = capture(original)
    reopened = SceneEvidenceModel.new(path: '/projects/acceptance.skp', target_x: 500.0)
    copy_acceptance_session(from: original, to: reopened)
    runtime_value.active_model = reopened

    result = verify(runtime_value)
    checkpoint = JiraNot::ConstructFlow::Core::NativeAcceptanceEvidenceStore.new(reopened)
                 .summary.dig('checkpoints', 'scene_tag_persistence')

    assert result['passed']
    assert_equal 'failed', checkpoint['status']
    changed = checkpoint.dig('evidence', 'differences', 'managed_scene_states', 'changed')
    assert changed.key?('ConstructFlow - Architecture Plan - Construction')
  end
end
