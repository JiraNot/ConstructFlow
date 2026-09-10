# frozen_string_literal: true

require 'minitest/autorun'
require_relative '../../apps/sketchup-extension/constructflow/core/representation_registry'

class RepresentationRegistryTest < Minitest::Test
  FakeObject = Struct.new(:id, :type)

  class FakeProvider
    attr_reader :requests

    def initialize
      @requests = []
    end

    def render(object:, request:)
      requests << [object, request]
      {
        primitives: [{ kind: 'line', points_mm: [[0, 0, 0], [1000, 0, 0]] }],
        annotations: [{ kind: 'object_tag', text: 'P-01' }],
        metadata: { source: 'semantic' }
      }
    end
  end

  def setup
    @registry = JiraNot::ConstructFlow::Core::RepresentationRegistry.new
    @provider = FakeProvider.new
  end

  def test_registers_and_renders_by_object_type_and_kind
    @registry.register(
      object_type: 'drainage.pipe',
      kind: 'plan',
      owner_module: 'constructflow.drainage',
      provider: @provider,
      policy: 'on_demand',
      metadata: { supports_scale: true }
    )

    object = FakeObject.new('pipe-1', 'drainage.pipe')
    result = @registry.render(
      object: object,
      kind: 'plan',
      view: 'plumbing_plan',
      scale: '1:50',
      phase_view: 'proposed',
      lod: 'construction'
    )

    assert_equal 'pipe-1', result['object_id']
    assert_equal 'drainage.pipe', result['object_type']
    assert_equal 'plan', result['kind']
    assert_equal 'constructflow.drainage', result['owner_module']
    assert_equal 'on_demand', result['policy']
    assert_equal 1, result['primitives'].length
    assert_equal 1, result['annotations'].length

    request = @provider.requests.first[1]
    assert_equal 'plumbing_plan', request['view']
    assert_equal '1:50', request['scale']
    assert_equal 'proposed', request['phase_view']
    assert_equal 'construction', request['lod']
  end

  def test_one_object_type_can_have_multiple_representations
    %w[model_3d plan section annotation].each do |kind|
      @registry.register(
        object_type: 'drainage.manhole',
        kind: kind,
        owner_module: 'constructflow.drainage',
        provider: FakeProvider.new,
        policy: kind == 'model_3d' ? 'persistent' : 'on_demand'
      )
    end

    available = @registry.available_for('drainage.manhole')
    assert_equal %w[annotation model_3d plan section], available.map { |entry| entry['kind'] }
    assert_equal 4, @registry.size
  end

  def test_rejects_duplicate_provider_for_same_type_and_kind
    2.times do |index|
      if index.zero?
        @registry.register(
          object_type: 'structure.column',
          kind: 'plan',
          owner_module: 'constructflow.structure',
          provider: FakeProvider.new
        )
      else
        assert_raises(ArgumentError) do
          @registry.register(
            object_type: 'structure.column',
            kind: 'plan',
            owner_module: 'constructflow.structure',
            provider: FakeProvider.new
          )
        end
      end
    end
  end

  def test_rejects_unknown_kind_and_invalid_owner
    assert_raises(ArgumentError) do
      @registry.register(
        object_type: 'roof.system',
        kind: 'perspective_magic',
        owner_module: 'constructflow.roof',
        provider: FakeProvider.new
      )
    end

    assert_raises(ArgumentError) do
      @registry.register(
        object_type: 'roof.system',
        kind: 'plan',
        owner_module: 'other.roof',
        provider: FakeProvider.new
      )
    end
  end
end
