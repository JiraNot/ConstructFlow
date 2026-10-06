# frozen_string_literal: true

require_relative '../test_helper'

class HostAdapterAndArchitectureCleanupTest < Minitest::Test
  def setup
    @model = FakeModel.new
    @entity = FakeEntity.new
    @diagnostics = JiraNot::ConstructFlow::Core::DiagnosticLog.new
    @id_gen = JiraNot::ConstructFlow::Core::IdGenerator.new
  end

  def test_host_entity_attribute_adapter_read_write_delete
    adapter = JiraNot::ConstructFlow::Core::Host::EntityAttributeAdapter.new(@entity)
    adapter.set_attribute('test_dict', 'sample_key', 'sample_val')
    assert_equal 'sample_val', adapter.get_attribute('test_dict', 'sample_key')

    adapter.delete_attribute('test_dict', 'sample_key')
    assert_nil adapter.get_attribute('test_dict', 'sample_key')
  end

  def test_host_entity_attribute_adapter_safe_with_unsupported_object
    adapter = JiraNot::ConstructFlow::Core::Host::EntityAttributeAdapter.new(Object.new)
    assert_nil adapter.get_attribute('dict', 'key')
    assert_equal 'fallback', adapter.get_attribute('dict', 'key', 'fallback')
    assert_equal 'val', adapter.set_attribute('dict', 'key', 'val')
    assert_nil adapter.delete_attribute('dict', 'key')
  end

  def test_host_model_transaction_adapter_lifecycle
    adapter = JiraNot::ConstructFlow::Core::Host::ModelTransactionAdapter.new(@model)
    assert adapter.start_operation('Op1', transparent: false)
    assert adapter.commit_operation
    assert_equal [[:start, 'Op1', true, false, false], [:commit]], @model.operations

    assert adapter.start_operation('Op2', transparent: true)
    assert adapter.abort_operation
  end

  def test_host_sketchup_host_factory
    host = JiraNot::ConstructFlow::Core::Host::SketchUpHost.new(@model)
    assert_equal @model, host.active_model

    attr_adapter = host.attribute_adapter(@entity)
    assert_instance_of JiraNot::ConstructFlow::Core::Host::EntityAttributeAdapter, attr_adapter
    assert_equal @entity, attr_adapter.entity

    tx_adapter = host.transaction_adapter
    assert_instance_of JiraNot::ConstructFlow::Core::Host::ModelTransactionAdapter, tx_adapter
    assert_equal @model, tx_adapter.model
  end

  def test_attribute_store_uses_host_adapter
    store = JiraNot::ConstructFlow::Core::AttributeStore.new(@entity)
    assert_instance_of JiraNot::ConstructFlow::Core::Host::EntityAttributeAdapter, store.adapter

    store.write('foo', 'bar')
    assert_equal 'bar', store.read('foo')
    store.delete('foo')
    assert_nil store.read('foo')
  end

  def test_transaction_manager_uses_host_adapter
    tx_manager = JiraNot::ConstructFlow::Core::TransactionManager.new(model: @model)
    assert_instance_of JiraNot::ConstructFlow::Core::Host::ModelTransactionAdapter, tx_manager.adapter

    ran = false
    tx_manager.run('CustomOp') { ran = true }
    assert ran
    assert_equal [[:start, 'CustomOp', true, false, false], [:commit]], @model.operations
  end

  def test_module_definition_structure
    defn = JiraNot::ConstructFlow::Core::ModuleDefinition.new(
      manifest: {
        id: 'constructflow.test_mod',
        name: 'Test Mod',
        version: '1.0.0',
        schema_version: 1,
        requires: ['constructflow.core']
      },
      installer: ->(_rt) { true },
      integrations: [->(_rt) { true }]
    )

    assert_equal 'constructflow.test_mod', defn.id
    assert_equal ['constructflow.core'], defn.requires
    assert_equal 1, defn.integrations.size
  end

  def test_builtin_modules_catalog_contains_all_twelve_domains
    definitions = JiraNot::ConstructFlow::Core::BuiltinModules.definitions
    assert_equal 12, definitions.size

    expected_ids = %w[
      constructflow.architecture
      constructflow.opening
      constructflow.door_window
      constructflow.structure
      constructflow.roof
      constructflow.surface
      constructflow.interior
      constructflow.library
      constructflow.drainage
      constructflow.electrical
      constructflow.extension
      constructflow.costing
    ]

    actual_ids = definitions.map(&:id)
    expected_ids.each do |expected_id|
      assert_includes actual_ids, expected_id, "BuiltinModules must include #{expected_id}"
    end
  end

  def test_dependency_graph_transitive_propagation_and_cycle_safety
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: @model, id_generator: @id_gen)
    graph = JiraNot::ConstructFlow::Core::DependencyGraph.new(smart_object_manager: manager)

    e1 = FakeEntity.new
    e2 = FakeEntity.new
    e3 = FakeEntity.new

    o1 = manager.create(entity: e1, type: 'architecture.wall', owner_module: 'constructflow.architecture')
    o2 = manager.create(entity: e2, type: 'opening.rectangular', owner_module: 'constructflow.opening')
    o3 = manager.create(entity: e3, type: 'door_window.instance', owner_module: 'constructflow.door_window')

    # o2 hosts on o1; o3 hosts on o2
    manager.add_relationship(e2, kind: 'host', target_id: o1.id)
    manager.add_relationship(e3, kind: 'host', target_id: o2.id)

    # Invalidate o1: must transitively affect o1, o2, and o3
    affected = graph.transitive_dependents(o1.id)
    assert_includes affected, o1.id
    assert_includes affected, o2.id
    assert_includes affected, o3.id

    # Test cycle safety: create circular relationship o1 -> o3
    manager.add_relationship(e1, kind: 'link', target_id: o3.id)
    cycle_affected = graph.transitive_dependents(o1.id)
    assert_equal 3, cycle_affected.size, 'Cycle must not cause infinite loop'

    # Test invalidation propagation
    graph.invalidate_affected(o1.id, 'dirty_geometry', 'dirty_quantity')
    reloaded_o3 = manager.fetch(e3)
    assert_includes reloaded_o3.dirty_flags, 'dirty_geometry'
    assert_includes reloaded_o3.dirty_flags, 'dirty_quantity'
  end
end
