# frozen_string_literal: true

require 'minitest/autorun'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/wall_definition'
require_relative '../../apps/sketchup-extension/constructflow/modules/architecture/attachment_edge_resolver'

class AttachmentEdgeResolverTest < Minitest::Test
  HostObject = Struct.new(:id, :type, :owner_module, :entity, keyword_init: true)

  class Objects
    def initialize(objects)
      @objects = objects
    end

    def fetch_by_id(id)
      @objects.find { |object| object.id.to_s == id.to_s }
    end
  end

  class Repository
    def initialize(definitions)
      @definitions = definitions
    end

    def read(entity)
      @definitions[entity]
    end
  end

  Runtime = Struct.new(:smart_objects)

  def boundary
    [[0, 0, 0], [6000, 0, 0], [6000, 4000, 0], [0, 4000, 0]]
  end

  def runtime_and_resolver(host_path:, host_type: 'architecture.wall', owner: 'constructflow.architecture')
    entity = Object.new
    host = HostObject.new(id: 'host-1', type: host_type, owner_module: owner, entity: entity)
    repository = Repository.new(
      entity => JiraNot::ConstructFlow::Architecture::WallDefinition.new(path_mm: host_path)
    )
    [
      Runtime.new(Objects.new([host])),
      JiraNot::ConstructFlow::Architecture::AttachmentEdgeResolver.new(repository: repository)
    ]
  end

  def test_geometry_match_resolves_unique_overlapping_edge
    runtime, resolver = runtime_and_resolver(host_path: [[-500, 0, 0], [6500, 0, 0]])

    result = resolver.resolve(runtime: runtime, boundary_mm: boundary, attachment_host_id: 'host-1')

    assert_equal 0, result.edge_index
    assert_in_delta 6000.0, result.overlap_mm, 0.001
    assert_equal 'geometry_match', result.resolution
  end

  def test_explicit_index_disambiguates_two_collinear_boundary_edges
    split_boundary = [[0, 0, 0], [3000, 0, 0], [6000, 0, 0], [6000, 4000, 0], [0, 4000, 0]]
    runtime, resolver = runtime_and_resolver(host_path: [[0, 0, 0], [6000, 0, 0]])

    error = assert_raises(ArgumentError) do
      resolver.resolve(runtime: runtime, boundary_mm: split_boundary, attachment_host_id: 'host-1')
    end
    assert_includes error.message, 'matches multiple extension edges'

    result = resolver.resolve(
      runtime: runtime,
      boundary_mm: split_boundary,
      attachment_host_id: 'host-1',
      explicit_edge_index: 1
    )
    assert_equal 1, result.edge_index
    assert_equal 'explicit', result.resolution
  end

  def test_missing_overlap_is_rejected_instead_of_guessing
    runtime, resolver = runtime_and_resolver(host_path: [[10_000, 10_000, 0], [16_000, 10_000, 0]])

    error = assert_raises(ArgumentError) do
      resolver.resolve(runtime: runtime, boundary_mm: boundary, attachment_host_id: 'host-1')
    end

    assert_includes error.message, 'does not overlap any extension boundary edge'
  end

  def test_non_architecture_host_is_rejected
    runtime, resolver = runtime_and_resolver(
      host_path: [[0, 0, 0], [6000, 0, 0]],
      host_type: 'structure.column',
      owner: 'constructflow.structure'
    )

    error = assert_raises(ArgumentError) do
      resolver.resolve(runtime: runtime, boundary_mm: boundary, attachment_host_id: 'host-1')
    end

    assert_includes error.message, 'must be an Architecture Smart Wall'
  end
end
