# frozen_string_literal: true

require_relative '../test_helper'

class SurfaceCommandsTest < Minitest::Test
  def setup
    @active_model = FakeModel.new
    @diagnostics = JiraNot::ConstructFlow::Core::DiagnosticLog.new
    @events = JiraNot::ConstructFlow::Core::EventBus.new(diagnostics: @diagnostics)
    @transactions = JiraNot::ConstructFlow::Core::TransactionManager.new(model: @active_model)
    @commands = JiraNot::ConstructFlow::Core::CommandBus.new(
      event_bus: @events,
      diagnostics: @diagnostics,
      transaction_manager: @transactions
    )
    @modules = JiraNot::ConstructFlow::Core::ModuleRegistry.new
    @modules.register(manifest: {
      id: 'constructflow.core', name: 'Core', version: '0.1.0', schema_version: 1,
      requires: [], provides: %w[core.objects core.events core.commands core.levels],
      optional_capabilities: [], objects: [], commands: [], events: [], providers: [], validators: []
    })
    @loader = JiraNot::ConstructFlow::Core::ModuleLoader.new(registry: @modules)
    @capabilities = JiraNot::ConstructFlow::Core::CapabilityRegistry.new
    @smarts = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: @active_model)
    @levels = JiraNot::ConstructFlow::Core::LevelRegistry.new
    @project = JiraNot::ConstructFlow::Core::ProjectStore.new(@active_model)
    @project.ensure_project!(name: 'test-proj')

    @runtime = Struct.new(:events, :commands, :modules, :module_loader,
                          :capabilities, :smart_objects, :levels,
                          :project, :active_model).new(
      @events, @commands, @modules, @loader, @capabilities,
      @smarts, @levels, @project, @active_model
    )

    JiraNot::ConstructFlow::Surface::Registration.install(@runtime)
  end

  def test_full_command_suite
    # 1. Create surface
    result = @commands.execute(
      'CreateSurfaceBoundary',
      {
        outer_boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 4000, 0], [0, 4000, 0]],
        surface_type: 'paver'
      },
      project_id: 'test-proj'
    )
    assert_equal 'success', result[:status], result[:errors].inspect
    surface_id = result[:created_object_ids].first

    # 2. SetSurfaceLevels
    lvl_res = @commands.execute(
      'SetSurfaceLevels',
      {
        surface_object_id: surface_id,
        slope_mode: 'planar',
        slope_percentage: 1.5,
        slope_direction_deg: 90.0
      },
      project_id: 'test-proj'
    )
    assert_equal 'success', lvl_res[:status]

    # 3. SetDrainToTarget
    drain_res = @commands.execute(
      'SetDrainToTarget',
      {
        surface_object_id: surface_id,
        drain_target_id: 'gully-1',
        slope_percentage: 2.0,
        target_point_mm: [2000, 2000, 0]
      },
      project_id: 'test-proj'
    )
    assert_equal 'success', drain_res[:status]

    # 4. ApplySurfaceAssembly
    asm_res = @commands.execute(
      'ApplySurfaceAssembly',
      {
        surface_object_id: surface_id,
        assembly: {
          id: 'asm-paver-1',
          name: 'Paver Assembly',
          layers: [
            { 'name' => 'Paver', 'thickness_mm' => 60.0, 'material_id' => 'p1', 'owned_by_surface' => true }
          ]
        }
      },
      project_id: 'test-proj'
    )
    assert_equal 'success', asm_res[:status]

    # 5. AddControlJoint
    joint_res = @commands.execute(
      'AddControlJoint',
      {
        surface_object_id: surface_id,
        start_point_mm: [0, 2000, 0],
        end_point_mm: [4000, 2000, 0],
        width_mm: 10.0
      },
      project_id: 'test-proj'
    )
    assert_equal 'success', joint_res[:status]

    # 6. AddTreePit
    pit_res = @commands.execute(
      'AddTreePit',
      {
        surface_object_id: surface_id,
        shape: 'square',
        center_point_mm: [1000, 1000, 0],
        width_mm: 800.0,
        length_mm: 800.0
      },
      project_id: 'test-proj'
    )
    assert_equal 'success', pit_res[:status]

    # 7. CreatePathBasedPaving
    path_res = @commands.execute(
      'CreatePathBasedPaving',
      {
        centerline_mm: [[0, 5000, 0], [10000, 5000, 0]],
        width_mm: 1500.0,
        surface_type: 'paver'
      },
      project_id: 'test-proj'
    )
    assert_equal 'success', path_res[:status]
    assert_equal 1, path_res[:created_object_ids].length
  end
end
