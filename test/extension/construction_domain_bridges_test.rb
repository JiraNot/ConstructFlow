# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/cabinet_run_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/validators/interior_validator')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/device_definition')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/route_planner')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/roof/extension_command_registration')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/surface/extension_command_registration')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/interior/extension_command_registration')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/electrical/extension_command_registration')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/drainage/extension_command_registration')

class ConstructionBridgeLevelRuntime
  attr_reader :levels

  def initialize
    @levels = Class.new do
      def fetch(_id)
        Struct.new(:elevation_mm).new(100.0)
      end
    end.new
  end
end

ConstructionBridgeObject = Struct.new(:id, :type, :owner_module, :entity, :relationships, keyword_init: true)

class ConstructionBridgeSmartObjects
  attr_reader :objects, :erased_ids

  def initialize(objects)
    @objects = objects
    @erased_ids = []
  end

  def all
    objects
  end

  def erase!(entity)
    object = objects.find { |value| value.entity.equal?(entity) }
    raise KeyError, 'bridge object not found' unless object

    @erased_ids << object.id
    objects.delete(object)
    object
  end
end

class ConstructionDomainBridgesTest < Minitest::Test
  def intent(program: 'kitchen', config: {})
    {
      'extension_id' => 'ext-1',
      'program' => program,
      'boundary_mm' => [[0, 0, 100], [4000, 0, 100], [4000, 3000, 100], [0, 3000, 100]],
      'base_level_id' => nil,
      'base_offset_mm' => 0,
      'target_height_mm' => 2800,
      'roof_intent' => 'lean_to',
      'config' => config
    }
  end

  def generated_object(id:, type:, owner:, slot:)
    ConstructionBridgeObject.new(
      id: id,
      type: type,
      owner_module: owner,
      entity: Object.new,
      relationships: [{
        'kind' => 'generated_from',
        'target_id' => 'ext-1',
        'role' => 'extension_source',
        'metadata' => { 'slot' => slot }
      }]
    )
  end

  def test_roof_bridge_builds_semantic_roof_from_extension_intent
    definition = JiraNot::ConstructFlow::Roof::ExtensionCommandRegistration.definition_from(
      'extension_id' => 'ext-1', 'intent' => intent
    )

    assert definition.valid?
    assert_equal 'ext-1', definition.generated_from_id
    assert_equal 'lean_to', definition.roof_form
    assert_in_delta 2900.0, definition.low_elevation_mm, 0.001
  end

  def test_surface_bridge_uses_extension_boundary_and_level_semantics
    definition = JiraNot::ConstructFlow::Surface::ExtensionCommandRegistration.definition_from(
      { 'extension_id' => 'ext-1', 'intent' => intent.merge('base_level_id' => 'ffl', 'base_offset_mm' => 50) },
      ConstructionBridgeLevelRuntime.new
    )

    assert definition.valid?
    assert_equal 'concrete', definition.surface_type
    assert_in_delta 150.0, definition.base_elevation_mm, 0.001
    assert definition.outer_boundary_mm.all? { |point| (point[2] - 150.0).abs < 0.001 }
  end

  def test_interior_bridge_only_auto_generates_for_safe_programs_or_explicit_request
    kitchen = intent(program: 'kitchen')
    custom = intent(program: 'custom')

    assert JiraNot::ConstructFlow::Interior::ExtensionCommandRegistration.auto_joinery?(kitchen)
    refute JiraNot::ConstructFlow::Interior::ExtensionCommandRegistration.auto_joinery?(custom)
    assert JiraNot::ConstructFlow::Interior::ExtensionCommandRegistration.auto_joinery?(
      custom.merge('config' => { 'auto_joinery' => true })
    )

    definition = JiraNot::ConstructFlow::Interior::ExtensionCommandRegistration.definition_from(
      'extension_id' => 'ext-1', 'intent' => kitchen
    )
    assert definition.valid?
    assert_operator definition.modules.length, :>=, 1
  end

  def test_interior_bridge_removes_previous_auto_joinery_when_program_no_longer_requests_it
    cabinet = generated_object(
      id: 'cab-1', type: 'interior.cabinet_run', owner: 'constructflow.interior', slot: 'primary_joinery'
    )
    smart_objects = ConstructionBridgeSmartObjects.new([cabinet])
    runtime = Struct.new(:smart_objects).new(smart_objects)

    result = JiraNot::ConstructFlow::Interior::ExtensionCommandRegistration.generate_or_update(
      runtime: runtime,
      input: { 'extension_id' => 'ext-1', 'intent' => intent(program: 'carport') },
      repository: nil,
      geometry: nil,
      validator: nil
    )

    assert_equal ['cab-1'], result[:removed_object_ids]
    assert_equal ['cab-1'], smart_objects.erased_ids
    assert_empty smart_objects.objects
  end

  def test_electrical_bridge_places_preliminary_light_at_extension_center
    data = intent(program: 'carport')
    definition = JiraNot::ConstructFlow::Electrical::ExtensionCommandRegistration.definition_from(
      'extension_id' => 'ext-1', 'intent' => data
    )

    assert JiraNot::ConstructFlow::Electrical::ExtensionCommandRegistration.auto_lighting?(data)
    assert definition.valid?
    assert_equal 'luminaire', definition.kind
    assert_equal [2000.0, 1500.0], definition.position_mm.first(2)
    assert_in_delta 2900.0, definition.position_mm[2], 0.001
    assert definition.weatherproof
  end

  def test_electrical_bridge_removes_previous_auto_light_when_program_no_longer_requests_it
    light = generated_object(
      id: 'light-1', type: 'electrical.luminaire', owner: 'constructflow.electrical', slot: 'primary_light'
    )
    smart_objects = ConstructionBridgeSmartObjects.new([light])
    runtime = Struct.new(:smart_objects).new(smart_objects)

    result = JiraNot::ConstructFlow::Electrical::ExtensionCommandRegistration.generate_or_update(
      runtime: runtime,
      input: { 'extension_id' => 'ext-1', 'intent' => intent(program: 'terrace') },
      repository: nil,
      geometry: nil
    )

    assert_equal ['light-1'], result[:removed_object_ids]
    assert_equal ['light-1'], smart_objects.erased_ids
    assert_empty smart_objects.objects
  end

  def test_drainage_bridge_refuses_to_invent_missing_network_endpoints
    result = JiraNot::ConstructFlow::Drainage::ExtensionCommandRegistration.generate_or_update(
      runtime: Object.new,
      input: { 'extension_id' => 'ext-1', 'intent' => intent(program: 'carport', config: { 'rainwater' => true }) },
      repository: nil,
      geometry: nil,
      validator: nil,
      planner: nil
    )

    assert_empty result[:created_object_ids]
    assert_includes result[:warnings].first, 'requires explicit start/end connectors'
    assert_equal false, result[:events].first[:payload][:generated]
  end
end
