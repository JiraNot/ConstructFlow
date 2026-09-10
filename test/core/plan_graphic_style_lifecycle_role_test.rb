# frozen_string_literal: true

require_relative '../test_helper'
require File.join(CORE, 'plan_graphic_style_registry')
require File.join(CORE, 'plan_graphic_style_registration')

class PlanGraphicStyleLifecycleRoleTest < Minitest::Test
  def setup
    @registry = JiraNot::ConstructFlow::Core::PlanGraphicStyleRegistry.new
    JiraNot::ConstructFlow::Core::PlanGraphicStyleRegistration.install(@registry)
  end

  def test_item_lifecycle_role_can_describe_partial_demolition_without_changing_source_lifecycle
    representation = {
      'source_lifecycle' => {
        'created_phase' => 'new_construction',
        'removed_phase' => nil
      }
    }
    style = @registry.resolve(
      item: { 'style_role' => 'opening_void', 'lifecycle_role' => 'demolition' },
      representation: representation
    )

    assert_equal 'phase_demolition', style['style_id']
    assert_equal 'dash', style['stroke_pattern']
    assert_equal 'demolition', style['color_key']
    assert_equal 'medium', style['line_weight']
  end

  def test_source_lifecycle_remains_default_when_item_has_no_override
    representation = {
      'source_lifecycle' => {
        'created_phase' => 'new_construction',
        'removed_phase' => nil
      }
    }
    style = @registry.resolve(item: {}, representation: representation)

    assert_equal 'phase_new', style['style_id']
    assert_equal 'new_work', style['color_key']
  end
end
