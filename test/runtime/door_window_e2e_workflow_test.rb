# frozen_string_literal: true

# End-to-end door/window workflow through the REAL command bus:
# bootstrap the full runtime (same require graph as SketchUp startup),
# then create wall -> opening -> catalog door -> save favorite -> re-place
# the favorite. Only the SketchUp API is stubbed; all business logic runs.

require_relative '../test_helper'
require 'sketchup'

Sketchup.active_model = FakeModel.new

BOOTSTRAP = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'bootstrap.rb')
require BOOTSTRAP

class DoorWindowE2EWorkflowTest < Minitest::Test
  Runtime = JiraNot::ConstructFlow::Runtime
  DoorWindow = JiraNot::ConstructFlow::DoorWindow

  def setup
    @runtime = Runtime
    @model = @runtime.active_model
    # Fresh attribute store per test keeps favorites/type registries isolated.
    @model.instance_variable_set(:@attributes, Hash.new { |h, k| h[k] = {} })
  end

  def test_full_door_window_workflow_through_command_bus
    project_id = @runtime.project.project_id
    execute = ->(name, input) { @runtime.commands.execute(name, input, project_id: project_id) }

    # 1. Wall 8000 x 2800 on the x axis (room for two 1800 openings).
    wall = execute.call('CreateWall',
                        path_mm: [[0, 0, 0], [8000, 0, 0]], thickness_mm: 100, height_mm: 2800,
                        base_level_id: 'level_ground_floor')
    assert_equal 'success', wall[:status], wall[:errors]&.join('; ')
    wall_id = wall[:created_object_ids].first
    assert wall_id

    # 2. Cut a 1800 x 2100 opening in that wall.
    opening = execute.call('CreateOpening',
                           host_object_id: wall_id, segment_index: 0, start_offset_mm: 1100,
                           width_mm: 1800, height_mm: 2100, sill_mm: 0)
    assert_equal 'success', opening[:status], opening[:errors]&.join('; ')
    opening_id = opening[:created_object_ids].first

    # 3. Place the D-SL2 catalog slider into the opening.
    door = execute.call('CreateDoorWindow',
                        opening_object_id: opening_id, type_id: 'D-SL2',
                        category: 'door', operation: 'sliding', panel_style: 'glazed')
    assert_equal 'success', door[:status], door[:errors]&.join('; ')
    door_id = door[:created_object_ids].first

    instance_repo = DoorWindow::InstanceRepository.new
    door_entity = @runtime.smart_objects.fetch_by_id(door_id).entity
    instance = instance_repo.read(door_entity)
    assert_equal 'D-SL2', instance.type_id
    assert DoorWindow::TypeRegistry.new(@model).registered?('D-SL2'),
           'catalog type must be registered into the model on first use'

    # 4. Save the placed door as a project favorite (as the panel would).
    favorite_id = HtmlDialogManagerSaveHelper.save(@runtime, door_id)
    assert favorite_id&.start_with?('USER:')

    favorites = DoorWindow::UserFavorites.all(@model)
    assert_equal 1, favorites.size
    snapshot = favorites.first[1]
    assert_equal 'D-SL2', snapshot['id']
    assert_equal 2100.0, snapshot['height_mm']

    # 5. Cut a second, non-overlapping opening and re-place from the favorite.
    opening2 = execute.call('CreateOpening',
                            host_object_id: wall_id, segment_index: 0, start_offset_mm: 4500,
                            width_mm: 1800, height_mm: 2100, sill_mm: 0)
    assert_equal 'success', opening2[:status], opening2[:errors]&.join('; ')

    door2 = execute.call('CreateDoorWindow',
                         opening_object_id: opening2[:created_object_ids].first,
                         type_id: favorite_id)
    assert_equal 'success', door2[:status], door2[:errors]&.join('; ')

    # 5a. The favorite must register its OWN model type (not reuse D-SL2).
    registry = DoorWindow::TypeRegistry.new(@model)
    assert registry.registered?(favorite_id), 'favorite must become its own registered type'
    favorite_type = registry.fetch(favorite_id)
    assert_equal 2100.0, favorite_type.height_mm
    assert_equal 'sliding', favorite_type.operation

    instance2 = instance_repo.read(@runtime.smart_objects.fetch_by_id(door2[:created_object_ids].first).entity)
    assert_equal favorite_id, instance2.type_id

    # 6. The wall now hosts two infilled openings (relationships use string keys).
    hosted = lambda do |object, wall_id|
      Array(object.relationships).any? do |r|
        (r['target_id'] || r[:target_id]).to_s == wall_id.to_s
      end
    end
    openings_on_wall = @runtime.smart_objects.all.count do |object|
      object.type == 'opening.rectangular' && hosted.call(object, wall_id)
    end
    assert_equal 2, openings_on_wall
    assert_equal 2, (@runtime.smart_objects.all.count { |o| o.type == 'door_window.instance' })
  end

  # Thin adapter over the panel save action so the E2E test exercises the
  # same code path the UI uses (HtmlDialogManager is a private-class module).
  class HtmlDialogManagerSaveHelper
    class << self
      def save(runtime, _door_id)
      # The panel sends the selected type; reuse the exact save implementation.
      JiraNot::ConstructFlow::Core::HtmlDialogManager.send(
        :save_door_window_favorite, runtime,
        { 'type_id' => 'D-SL2', 'name' => 'ประตูหน้าบ้าน', 'width_mm' => 1800, 'height_mm' => 2100 }
      )
      end
    end
  end
end
