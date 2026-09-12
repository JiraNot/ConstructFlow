# frozen_string_literal: true

require_relative '../test_helper'

class ControlJointTest < Minitest::Test
  Surface = JiraNot::ConstructFlow::Surface

  def test_control_joint_length_and_validation
    joint = Surface::ControlJointDefinition.new(
      surface_object_id: 'surf-1',
      start_point_mm: [0, 500, 0],
      end_point_mm: [3000, 500, 0],
      width_mm: 12.0,
      depth_mm: 30.0,
      material_id: 'polyurethane_sealant',
      joint_type: 'expansion'
    )

    assert joint.valid?
    assert_in_delta 3000.0, joint.length_mm, 0.01
    assert_equal 'expansion', joint.joint_type
  end

  def test_degenerate_joint_rejected
    joint = Surface::ControlJointDefinition.new(
      surface_object_id: 'surf-1',
      start_point_mm: [100, 100, 0],
      end_point_mm: [100, 100, 0]
    )

    refute joint.valid?
    assert joint.errors.any? { |e| e.include?('identical') }
  end

  def test_quantity_provider_emits_joint_length
    joints = [
      Surface::ControlJointDefinition.new(surface_object_id: 'surf-1', start_point_mm: [0, 0, 0], end_point_mm: [5000, 0, 0]),
      Surface::ControlJointDefinition.new(surface_object_id: 'surf-1', start_point_mm: [0, 3000, 0], end_point_mm: [5000, 3000, 0])
    ]
    smart_obj = Struct.new(:id, :removed_phase, :created_phase, :source_state).new(
      'surf-1', nil, JiraNot::ConstructFlow::Core::Phase::NEW_CONSTRUCTION, 'confirmed'
    )

    provider = Surface::Quantity::SurfaceQuantityProvider.new
    items = provider.control_joint_quantities(smart_object: smart_obj, definitions: joints)

    assert_equal 1, items.length
    assert_in_delta 10.0, items.first[:value], 0.01 # 5m + 5m = 10m
    assert_equal 'm', items.first[:unit]
    assert_equal 2, items.first[:breakdown][:joint_count]
  end
end
