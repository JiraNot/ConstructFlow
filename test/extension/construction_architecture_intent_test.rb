# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_intent_store')

class ConstructionArchitectureIntentTest < Minitest::Test
  def test_architecture_intent_is_persisted_and_merged_without_losing_other_domains
    entity = FakeEntity.new
    store = JiraNot::ConstructFlow::Extension::ConstructionIntentStore.new

    store.write(
      entity,
      domains: {
        architecture: {
          enabled: true,
          wall_type_id: 'company.wall.aac.100',
          wall_thickness_mm: 100
        },
        drainage: {
          enabled: true,
          start_connector_id: 'fixture-1',
          end_connector_id: 'mh-1'
        }
      }
    )

    merged = store.update(
      entity,
      domains: {
        architecture: { wall_height_mm: 3000 }
      }
    )

    assert_equal 'company.wall.aac.100', merged.dig('domains', 'architecture', 'wall_type_id')
    assert_equal 100, merged.dig('domains', 'architecture', 'wall_thickness_mm')
    assert_equal 3000, merged.dig('domains', 'architecture', 'wall_height_mm')
    assert_equal 'fixture-1', merged.dig('domains', 'drainage', 'start_connector_id')
    assert_equal 'mh-1', merged.dig('domains', 'drainage', 'end_connector_id')
  end
end
