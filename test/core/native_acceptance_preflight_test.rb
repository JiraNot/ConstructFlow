# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_preflight')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_evidence_store')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/core/native_acceptance_service')

NativePreflightNamed = Struct.new(:name)
NativePreflightProject = Struct.new(:project_id)
NativePreflightObject = Struct.new(:id, :type, :owner_module, :relationships, keyword_init: true)

class NativePreflightModel < FakeModel
  attr_accessor :path
  attr_reader :pages, :layers

  def initialize(path:, pages: [], layers: [])
    super([])
    @path = path
    @pages = pages.map { |name| NativePreflightNamed.new(name) }
    @layers = layers.map { |name| NativePreflightNamed.new(name) }
  end
end

class NativePreflightObjects
  def initialize(objects)
    @objects = objects
  end

  def all
    @objects
  end

  def fetch_by_id(id)
    @objects.find { |object| object.id.to_s == id.to_s }
  end
end

NativePreflightRuntime = Struct.new(:active_model, :project, :smart_objects)

class NativeAcceptancePreflightTest < Minitest::Test
  def runtime(path: '/projects/native-acceptance.skp', pages: ['A-101'], layers: ['CF-DRAWING-ARCHITECTURE'])
    extension = NativePreflightObject.new(
      id: 'ext-1', type: 'extension.zone', owner_module: 'constructflow.extension', relationships: []
    )
    wall = generated('wall-1', 'architecture.wall', 'constructflow.architecture')
    structure = generated('column-1', 'structure.column', 'constructflow.structure')
    roof = generated('roof-1', 'roof.system', 'constructflow.roof')
    drainage = generated('dp-1', 'drainage.downpipe', 'constructflow.drainage')
    surface = generated('surface-1', 'surface.boundary', 'constructflow.surface')
    interior = generated('cab-1', 'interior.cabinet_run', 'constructflow.interior')
    electrical = generated('light-1', 'electrical.luminaire', 'constructflow.electrical')

    NativePreflightRuntime.new(
      NativePreflightModel.new(path: path, pages: pages, layers: layers),
      NativePreflightProject.new('project-1'),
      NativePreflightObjects.new([extension, wall, structure, roof, drainage, surface, interior, electrical])
    )
  end

  def generated(id, type, owner)
    NativePreflightObject.new(
      id: id,
      type: type,
      owner_module: owner,
      relationships: [{ 'kind' => 'generated_from', 'target_id' => 'ext-1', 'role' => 'extension_source' }]
    )
  end

  def test_ready_when_saved_project_has_semantic_objects_scenes_tags_and_extension_scope
    result = JiraNot::ConstructFlow::Core::NativeAcceptancePreflight.new(runtime: runtime).run(extension_id: 'ext-1')

    assert result['ready']
    assert_empty result['failed_checks']
    assert result.dig('coverage', 'architecture')
    assert result.dig('coverage', 'structure')
    assert result.dig('coverage', 'roof')
    assert result.dig('coverage', 'drainage')
    assert result.dig('coverage', 'surface')
    assert result.dig('coverage', 'interior')
    assert result.dig('coverage', 'electrical')
    assert_empty result['warnings']
  end

  def test_unsaved_model_missing_scenes_and_managed_tags_is_not_ready
    result = JiraNot::ConstructFlow::Core::NativeAcceptancePreflight.new(
      runtime: runtime(path: '', pages: [], layers: ['SITE-TREES'])
    ).run

    refute result['ready']
    assert_includes result['failed_checks'], 'saved_model'
    assert_includes result['failed_checks'], 'scenes'
    assert_includes result['failed_checks'], 'managed_tags'
  end

  def test_selected_extension_must_exist_and_be_extension_zone
    result = JiraNot::ConstructFlow::Core::NativeAcceptancePreflight.new(runtime: runtime).run(extension_id: 'missing')

    refute result['ready']
    assert_includes result['failed_checks'], 'extension_exists'
    assert_includes result['failed_checks'], 'extension_generated_scope'
  end

  def test_selected_extension_requires_generated_scope
    source = NativePreflightObject.new(
      id: 'ext-empty', type: 'extension.zone', owner_module: 'constructflow.extension', relationships: []
    )
    current = runtime
    current.smart_objects = NativePreflightObjects.new([source])

    result = JiraNot::ConstructFlow::Core::NativeAcceptancePreflight.new(runtime: current).run(extension_id: 'ext-empty')

    refute result['ready']
    assert_includes result['failed_checks'], 'extension_generated_scope'
  end

  def test_missing_recommended_domain_coverage_is_advisory_not_a_readiness_failure
    current = runtime
    source = current.smart_objects.fetch_by_id('ext-1')
    wall = current.smart_objects.fetch_by_id('wall-1')
    current.smart_objects = NativePreflightObjects.new([source, wall])

    result = JiraNot::ConstructFlow::Core::NativeAcceptanceService.new(runtime: current).preflight(extension_id: 'ext-1')

    assert result['ready']
    refute_empty result['warnings']
    assert_includes result['warnings'].first, 'structure'
    assert_equal false, result.dig('coverage', 'structure')
  end
end
