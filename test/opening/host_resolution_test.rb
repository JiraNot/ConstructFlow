# frozen_string_literal: true

require_relative '../test_helper'
require_relative '../../apps/sketchup-extension/constructflow/modules/opening/registration'

class OpeningHostResolutionTest < Minitest::Test
  Runtime = Struct.new(:smart_objects)

  class HostCapability
    def compatible_host?(object)
      object && object.type == 'architecture.wall'
    end
  end

  def setup
    @manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    @repository = JiraNot::ConstructFlow::Opening::OpeningRepository.new
    @runtime = Runtime.new(@manager)
  end

  def test_missing_host_is_reported_and_marked_for_explicit_resolution
    opening_entity = FakeEntity.new
    opening = @manager.create(
      entity: opening_entity,
      type: 'opening.rectangular',
      owner_module: 'constructflow.opening'
    )
    @repository.write(
      opening_entity,
      JiraNot::ConstructFlow::Opening::OpeningDefinition.new(
        host_object_id: 'wall-deleted', segment_index: 0, start_offset_mm: 500
      )
    )

    unresolved = JiraNot::ConstructFlow::Opening::Registration.unresolved_host_openings(
      @runtime, @repository, HostCapability.new
    )

    assert_equal [opening.id], unresolved.map { |entry| entry[:object].id }
    assert_equal 'missing_host', unresolved.first[:reason]

    JiraNot::ConstructFlow::Opening::Registration.mark_unresolved_host!(
      @runtime, opening, host_object_id: unresolved.first[:host_object_id], reason: unresolved.first[:reason]
    )
    marked = @manager.fetch_by_id(opening.id)

    assert_equal 'unresolved_host', marked.status
    assert_equal 'unresolved', marked.revision_meta.dig('host_resolution', 'status')
    assert_equal 'wall-deleted', marked.revision_meta.dig('host_resolution', 'host_object_id')
    assert_includes marked.dirty_flags, 'dirty_drawing'
  end

  def test_replacement_metadata_records_resolved_host
    opening = JiraNot::ConstructFlow::Core::SmartObject.new(
      entity: FakeEntity.new, id: 'opening-1', type: 'opening.rectangular', owner_module: 'constructflow.opening',
      schema_version: 1, display_name: 'Opening', created_phase: 'new_construction', removed_phase: nil,
      level_refs: [], status: 'unresolved_host', relationships: [], geometry_refs: [], catalog_ref: nil,
      source_state: 'confirmed', revision_meta: { 'host_resolution' => { 'status' => 'unresolved' } },
      created_at: nil, updated_at: nil, dirty_flags: []
    )

    meta = JiraNot::ConstructFlow::Opening::Registration.resolved_revision_meta(opening, 'wall-new')

    assert_equal({ 'status' => 'resolved', 'host_object_id' => 'wall-new' }, meta['host_resolution'])
  end
end
