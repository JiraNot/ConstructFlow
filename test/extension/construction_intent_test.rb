# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_intent_store')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_intent_registration')
require File.join(ROOT, 'apps/sketchup-extension/constructflow/modules/extension/construction_workflow_runner')

ConstructionIntentObject = Struct.new(
  :id, :type, :owner_module, :entity,
  keyword_init: true
)

class ConstructionIntentObjects
  attr_reader :dirty_calls

  def initialize(object)
    @object = object
    @dirty_calls = []
  end

  def fetch(entity)
    entity.equal?(@object.entity) ? @object : nil
  end

  def fetch_by_id(id)
    id.to_s == @object.id.to_s ? @object : nil
  end

  def mark_dirty(entity, *flags)
    @dirty_calls << [entity, flags]
    true
  end
end

class ConstructionIntentCommands
  Registration = Struct.new(:validator, :handler, keyword_init: true)

  def initialize
    @registrations = {}
  end

  def registered?(name)
    @registrations.key?(name.to_s)
  end

  def register(name, **options, &block)
    @registrations[name.to_s] = Registration.new(validator: options[:validator], handler: block)
  end

  def execute(name, input)
    registration = @registrations.fetch(name.to_s)
    command = { input: input }
    errors = Array(registration.validator&.call(command))
    return { status: 'rejected', errors: errors } unless errors.empty?

    registration.handler.call(command).merge(status: 'success')
  end
end

class ConstructionIntentWorkflowRuntime
  attr_reader :smart_objects, :project, :planned_options

  def initialize(object)
    @smart_objects = ConstructionIntentObjects.new(object)
    @project = Struct.new(:project_id).new('project-1')
  end

  def extension_plan(_definition, options = {})
    @planned_options = options
    { 'extension_id' => options['extension_id'], 'steps' => [] }
  end

  def execute_extension(_plan, dry_run:, actor:, project_id:)
    raise 'expected dry run' unless dry_run
    raise 'actor missing' unless actor
    raise 'project missing' if project_id.to_s.empty?
    {
      'extension_id' => 'ext-1',
      'status' => 'preview',
      'dry_run' => true,
      'steps' => [],
      'dirty_domains' => []
    }
  end
end

class ConstructionIntentTest < Minitest::Test
  def setup
    @entity = FakeEntity.new
    @object = ConstructionIntentObject.new(
      id: 'ext-1', type: 'extension.zone', owner_module: 'constructflow.extension', entity: @entity
    )
    @store = JiraNot::ConstructFlow::Extension::ConstructionIntentStore.new
  end

  def extension_definition
    JiraNot::ConstructFlow::Extension::ExtensionDefinition.new(
      boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0], [0, 3000, 0]],
      program: 'kitchen', mode: 'construction', target_height_mm: 2800
    )
  end

  def test_absent_intent_is_legacy_compatible_empty_schema
    assert_equal(
      { 'schema_version' => 1, 'domains' => {} },
      @store.read(@entity)
    )
  end

  def test_update_merges_domain_config_and_replace_can_reset_it
    @store.write(
      @entity,
      domains: {
        drainage: {
          enabled: true,
          start_connector_id: 'fixture-1',
          end_connector_id: 'mh-1',
          routing_mode: 'semi_auto'
        }
      }
    )

    merged = @store.update(
      @entity,
      domains: { drainage: { diameter_mm: 100 }, structure: { foundation: 'pile_cap' } }
    )
    assert_equal 'fixture-1', merged.dig('domains', 'drainage', 'start_connector_id')
    assert_equal 100, merged.dig('domains', 'drainage', 'diameter_mm')
    assert_equal 'pile_cap', merged.dig('domains', 'structure', 'foundation')

    replaced = @store.update(@entity, domains: { roof: { enabled: false } }, replace: true)
    assert_equal({ 'roof' => { 'enabled' => false } }, replaced['domains'])
  end

  def test_unknown_domain_is_rejected
    error = assert_raises(ArgumentError) do
      @store.write(@entity, domains: { invented_domain: { enabled: true } })
    end
    assert_includes error.message, 'unknown construction intent domain'
  end

  def test_public_command_persists_intent_and_invalidates_dependents
    commands = ConstructionIntentCommands.new
    smart_objects = ConstructionIntentObjects.new(@object)
    runtime = Struct.new(:commands, :smart_objects).new(commands, smart_objects)

    JiraNot::ConstructFlow::Extension::ConstructionIntentRegistration.install(runtime)
    result = commands.execute(
      'SetExtensionConstructionIntent',
      {
        object_id: 'ext-1',
        domains: {
          drainage: {
            enabled: true,
            start_connector_id: 'fixture-1',
            end_connector_id: 'mh-1'
          }
        }
      }
    )

    assert_equal 'success', result[:status]
    assert_equal ['ext-1'], result[:updated_object_ids]
    persisted = @store.read(@entity)
    assert_equal 'fixture-1', persisted.dig('domains', 'drainage', 'start_connector_id')
    assert_equal 'mh-1', persisted.dig('domains', 'drainage', 'end_connector_id')
    flags = smart_objects.dirty_calls.last[1]
    assert_includes flags, 'dirty_dependents'
    assert_includes flags, 'dirty_quantity'
    assert_includes flags, 'dirty_drawing'
    assert_equal 'ExtensionConstructionIntentChanged', result[:events].first[:name]
  end

  def test_workflow_reuses_persisted_drainage_connectors_without_run_overrides
    JiraNot::ConstructFlow::Extension::Repository.new.write(@entity, extension_definition)
    @store.write(
      @entity,
      domains: {
        drainage: {
          enabled: true,
          start_connector_id: 'fixture-1',
          end_connector_id: 'mh-1',
          routing_mode: 'semi_auto'
        }
      }
    )
    runtime = ConstructionIntentWorkflowRuntime.new(@object)

    result = JiraNot::ConstructFlow::Extension::ConstructionWorkflowRunner.new(runtime: runtime).run(
      extension_id: 'ext-1', dry_run: true
    )

    assert_equal 'preview', result['status']
    assert_equal 'fixture-1', runtime.planned_options.dig('domains', 'drainage', 'start_connector_id')
    assert_equal 'mh-1', runtime.planned_options.dig('domains', 'drainage', 'end_connector_id')
    assert_equal 'semi_auto', result.dig('construction_intent', 'persisted_domains', 'drainage', 'routing_mode')
  end

  def test_run_override_wins_without_mutating_persisted_intent
    JiraNot::ConstructFlow::Extension::Repository.new.write(@entity, extension_definition)
    @store.write(
      @entity,
      domains: {
        drainage: {
          enabled: true,
          start_connector_id: 'fixture-1',
          end_connector_id: 'mh-1',
          diameter_mm: 75
        }
      }
    )
    runtime = ConstructionIntentWorkflowRuntime.new(@object)

    JiraNot::ConstructFlow::Extension::ConstructionWorkflowRunner.new(runtime: runtime).run(
      extension_id: 'ext-1',
      domains: { drainage: { diameter_mm: 100, routing_mode: 'manual' } },
      dry_run: true
    )

    assert_equal 100, runtime.planned_options.dig('domains', 'drainage', 'diameter_mm')
    assert_equal 'manual', runtime.planned_options.dig('domains', 'drainage', 'routing_mode')
    persisted = @store.read(@entity)
    assert_equal 75, persisted.dig('domains', 'drainage', 'diameter_mm')
    assert_nil persisted.dig('domains', 'drainage', 'routing_mode')
  end
end
