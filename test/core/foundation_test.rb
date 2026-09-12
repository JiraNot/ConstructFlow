# frozen_string_literal: true

require_relative '../test_helper'

class SmartObjectManagerTest < Minitest::Test
  def setup
    @entity = FakeEntity.new
    @model = FakeModel.new([@entity])
    @project = JiraNot::ConstructFlow::Core::ProjectStore.new(@model)
    @project.ensure_project!
    @levels = JiraNot::ConstructFlow::Core::LevelRegistry.new(project_store: @project)
    @levels.register(id: 'FFL_GROUND', name: 'Ground FFL', kind: 'FFL', elevation_mm: 450)
  end

  def test_stable_identity_survives_manager_rebuild
    manager = manager_for(@model)
    object = manager.create(
      entity: @entity,
      type: 'architecture.wall',
      owner_module: 'constructflow.architecture',
      created_phase: 'existing',
      level_refs: [{ role: 'base', level_id: 'FFL_GROUND', offset_mm: 0 }]
    )

    reloaded = manager_for(@model)
    assert_equal 1, reloaded.scan!
    recovered = reloaded.fetch_by_id(object.id)

    refute_nil recovered
    assert_equal object.id, recovered.id
    assert_equal 'architecture.wall', recovered.type
    assert_equal 'existing', recovered.created_phase
    assert_equal 'FFL_GROUND', recovered.level_refs.first['level_id']
  end

  def test_demolition_and_dirty_flags_persist
    manager = manager_for(@model)
    object = manager.create(
      entity: @entity,
      type: 'architecture.wall',
      owner_module: 'constructflow.architecture',
      created_phase: 'existing'
    )

    updated = manager.update_lifecycle(object.entity, removed_phase: 'demolition')
    updated = manager.mark_dirty(updated.entity, 'dirty_quantity', 'dirty_drawing')

    assert_equal 'demolition', updated.removed_phase
    assert_includes updated.dirty_flags, 'dirty_quantity'
    assert_includes updated.dirty_flags, 'dirty_drawing'
    refute updated.visible_in?('proposed')
  end

  def test_unknown_level_reference_is_rejected_when_level_id_is_explicit
    manager = manager_for(@model)

    assert_raises(ArgumentError) do
      manager.create(
        entity: @entity,
        type: 'architecture.wall',
        owner_module: 'constructflow.architecture',
        level_refs: [{ role: 'base', level_id: 'MISSING' }]
      )
    end
  end

  private

  def manager_for(model)
    JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: model, levels: @levels)
  end
end

class ProjectLevelTest < Minitest::Test
  def test_project_and_levels_persist_in_model_attributes
    model = FakeModel.new
    project = JiraNot::ConstructFlow::Core::ProjectStore.new(model)
    id = project.ensure_project!(name: 'House A', code: 'A-01')
    project.working_phase = 'existing'

    levels = JiraNot::ConstructFlow::Core::LevelRegistry.new(project_store: project)
    levels.register(id: 'GL', name: 'Ground', kind: 'GL', elevation_mm: -100, source_state: 'measured')

    reopened_project = JiraNot::ConstructFlow::Core::ProjectStore.new(model)
    reopened_levels = JiraNot::ConstructFlow::Core::LevelRegistry.new(project_store: reopened_project)

    assert_equal id, reopened_project.project_id
    assert_equal 'existing', reopened_project.working_phase
    assert_equal(-100.0, reopened_levels.fetch('GL').elevation_mm)
    assert_equal 'measured', reopened_levels.fetch('GL').source_state
  end

  def test_project_metadata_update_preserves_project_identity
    model = FakeModel.new
    project = JiraNot::ConstructFlow::Core::ProjectStore.new(model)
    id = project.ensure_project!

    updated = project.update_metadata!(name: 'House A', code: 'A-01')

    assert_equal id, updated[:id]
    assert_equal 'House A', updated[:name]
    assert_equal 'A-01', updated[:code]
    assert_equal id, project.project_id
  end

  def test_project_metadata_command_is_registered_in_core_manifest
    source = File.read(File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'main.rb'))

    assert_includes source, 'UpdateProjectMetadata'
    assert_includes source, 'ProjectChanged'
  end

  def test_level_ids_are_returned_in_elevation_order
    model = FakeModel.new
    project = JiraNot::ConstructFlow::Core::ProjectStore.new(model)
    project.ensure_project!
    levels = JiraNot::ConstructFlow::Core::LevelRegistry.new(project_store: project)
    levels.register(id: 'L2', name: 'Upper', kind: 'FFL', elevation_mm: 3200)
    levels.register(id: 'L1', name: 'Ground', kind: 'FFL', elevation_mm: 0)

    assert_equal %w[L1 L2], levels.ids
  end

  def test_unknown_level_can_have_nil_elevation
    model = FakeModel.new
    project = JiraNot::ConstructFlow::Core::ProjectStore.new(model)
    project.ensure_project!
    levels = JiraNot::ConstructFlow::Core::LevelRegistry.new(project_store: project)

    level = levels.register(id: 'EX_IL', name: 'Existing invert', kind: 'IL', elevation_mm: nil, source_state: 'verify_on_site')

    assert_nil level.elevation_mm
    assert_equal 'verify_on_site', level.source_state
  end

  def test_seed_default_level_when_project_has_none
    # Simulates the attach_model auto-seed behavior from Runtime
    model = FakeModel.new
    project = JiraNot::ConstructFlow::Core::ProjectStore.new(model)
    project.ensure_project!(name: 'New Build')
    levels = JiraNot::ConstructFlow::Core::LevelRegistry.new(project_store: project)

    # Brand-new project: no levels yet
    assert_equal 0, levels.size

    # Runtime would call seed_default_level! here
    levels.register(id: 'level_ground_floor', name: 'Ground Floor', kind: 'floor',
                    elevation_mm: 0.0, source_state: 'confirmed')

    assert_equal 1, levels.size
    ground = levels.fetch('level_ground_floor')
    assert_equal 'Ground Floor', ground.name
    assert_equal 'floor', ground.kind
    assert_equal 0.0, ground.elevation_mm
    assert_equal 'confirmed', ground.source_state

    # Re-open model: level must be persisted
    reopened_project = JiraNot::ConstructFlow::Core::ProjectStore.new(model)
    reopened_levels = JiraNot::ConstructFlow::Core::LevelRegistry.new(project_store: reopened_project)
    assert_equal 1, reopened_levels.size
    assert_equal 'Ground Floor', reopened_levels.fetch('level_ground_floor').name

    # Second seed attempt raises (idempotency guard via register)
    assert_raises(ArgumentError) do
      reopened_levels.register(id: 'level_ground_floor', name: 'Ground Floor', kind: 'floor',
                               elevation_mm: 0.0, source_state: 'confirmed')
    end
  end
end

class CommandEventTest < Minitest::Test
  def setup
    @model = FakeModel.new
    @diagnostics = JiraNot::ConstructFlow::Core::DiagnosticLog.new
    @events = JiraNot::ConstructFlow::Core::EventBus.new(diagnostics: @diagnostics)
    @transactions = JiraNot::ConstructFlow::Core::TransactionManager.new(model: @model)
    @commands = JiraNot::ConstructFlow::Core::CommandBus.new(
      event_bus: @events,
      diagnostics: @diagnostics,
      transaction_manager: @transactions
    )
  end

  def test_validation_rejects_before_transaction
    @commands.register('Example', validator: ->(_command) { ['invalid input'] }) { raise 'must not run' }

    result = @commands.execute('Example', {})

    assert_equal 'rejected', result[:status]
    assert_empty @model.operations
  end

  def test_successful_command_commits_then_publishes_event
    received = []
    @events.subscribe('ObjectUpdated') { |event| received << [event, @model.operations.dup] }
    @commands.register('Example') do |_command|
      { updated_object_ids: ['cf_1'], events: [{ name: 'ObjectUpdated', object_ids: ['cf_1'] }] }
    end

    result = @commands.execute('Example', {})

    assert_equal 'success', result[:status]
    assert_equal :start, @model.operations[0][0]
    assert_equal :commit, @model.operations[1][0]
    assert_equal 1, received.length
    refute_nil received.first[0][:caused_by_command_id]
    assert_equal :start, received.first[1][0][0]
    assert_equal 1, received.first[1].length
  end

  def test_nested_command_uses_the_outer_native_operation
    received = []
    @events.subscribe('InnerChanged') { |event| received << event }
    @commands.register('Inner') do |_command|
      { events: [{ name: 'InnerChanged' }] }
    end
    @commands.register('Outer') do |_command|
      inner = @commands.execute('Inner')
      raise inner[:errors].join(', ') unless inner[:status] == 'success'

      { events: [{ name: 'OuterChanged' }] }
    end

    result = @commands.execute('Outer')

    assert_equal 'success', result[:status]
    assert_equal 1, @model.operations.count { |operation| operation.first == :start }
    assert_equal 1, @model.operations.count { |operation| operation.first == :commit }
    assert_equal 1, received.length
  end

  def test_nested_transaction_failure_can_be_handled_without_aborting_outer_operation
    @transactions.run('Outer') do
      assert_raises(RuntimeError) do
        @transactions.run('Inner') { raise 'inner failure' }
      end
    end

    assert_equal 1, @model.operations.count { |operation| operation.first == :start }
    assert_equal 1, @model.operations.count { |operation| operation.first == :commit }
    assert_equal 0, @model.operations.count { |operation| operation.first == :abort }
  end

  def test_handler_failure_aborts_transaction
    @commands.register('Explode') { raise 'boom' }

    result = @commands.execute('Explode', {})

    assert_equal 'failed', result[:status]
    assert_equal :abort, @model.operations.last[0]
  end

  def test_subscriber_failure_is_isolated
    received = []
    @events.subscribe('Changed', owner: 'broken') { raise 'subscriber boom' }
    @events.subscribe('Changed', owner: 'healthy') { |event| received << event[:event_id] }

    event = @events.publish('Changed')

    assert_equal 1, received.length
    assert_equal 1, event[:subscriber_errors].length
    assert_equal 'broken', event[:subscriber_errors].first[:owner]
  end
end

class ModuleRegistryTest < Minitest::Test
  CORE = {
    id: 'constructflow.core', name: 'Core', version: '0.1.0', schema_version: 1,
    requires: [], provides: ['core.objects'], optional_capabilities: [], objects: [],
    commands: [], events: [], providers: [], validators: []
  }.freeze

  def test_valid_manifest_registers_capability
    registry = JiraNot::ConstructFlow::Core::ModuleRegistry.new
    registry.register(manifest: CORE)

    assert registry.registered?('constructflow.core')
    assert_equal 'constructflow.core', registry.capability_owner('core.objects')
  end

  def test_invalid_manifest_does_not_partially_register
    registry = JiraNot::ConstructFlow::Core::ModuleRegistry.new

    assert_raises(JiraNot::ConstructFlow::Core::ModuleRegistry::ManifestError) do
      registry.register(manifest: { id: 'bad', name: '', version: '0.1.0', schema_version: 1 })
    end

    assert_equal 0, registry.size
  end

  def test_batch_loader_rolls_back_when_dependency_is_missing
    registry = JiraNot::ConstructFlow::Core::ModuleRegistry.new
    registry.register(manifest: CORE)
    loader = JiraNot::ConstructFlow::Core::ModuleLoader.new(registry: registry)

    roof = {
      id: 'constructflow.roof', name: 'Roof', version: '0.1.0', schema_version: 1,
      requires: ['constructflow.missing'], provides: [], optional_capabilities: [], objects: [],
      commands: [], events: [], providers: [], validators: []
    }

    assert_raises(JiraNot::ConstructFlow::Core::ModuleRegistry::ManifestError) do
      loader.load_all([roof])
    end

    assert_equal ['constructflow.core'], registry.registered_ids
  end
end

class MigrationPhaseTest < Minitest::Test
  def test_migrations_run_once_per_version_step
    registry = JiraNot::ConstructFlow::Core::MigrationRegistry.new
    registry.register(namespace: 'architecture.wall', from: 1, to: 2) do |payload|
      payload['v2'] = true
      payload
    end
    registry.register(namespace: 'architecture.wall', from: 2, to: 3) do |payload|
      payload['v3'] = true
      payload
    end

    result = registry.migrate(namespace: 'architecture.wall', payload: { 'name' => 'W1' }, from_version: 1, to_version: 3)

    assert_equal true, result['v2']
    assert_equal true, result['v3']
  end

  def test_phase_views_derive_from_one_lifecycle
    phase = JiraNot::ConstructFlow::Core::Phase

    assert phase.visible_in?(created_phase: 'existing', removed_phase: nil, view: 'proposed')
    refute phase.visible_in?(created_phase: 'existing', removed_phase: 'demolition', view: 'proposed')
    assert phase.visible_in?(created_phase: 'new_construction', removed_phase: nil, view: 'proposed')
    refute phase.visible_in?(created_phase: 'new_construction', removed_phase: nil, view: 'existing')
    assert_equal :demolish, phase.state_in(created_phase: 'existing', removed_phase: 'demolition', view: 'demolition')
  end
end
