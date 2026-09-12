# frozen_string_literal: true

require 'minitest/autorun'

class NativeToolContractTest < Minitest::Test
  ROOT = File.expand_path('../..', __dir__)
  TOOLS_ROOT = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules')

  def test_tools_with_numeric_text_input_enable_sketchup_vcb
    tool_files = Dir[File.join(TOOLS_ROOT, '**', 'tools', '*.rb')]
    numeric_tools = tool_files.select { |path| File.read(path).include?('def onUserText') }

    refute_empty numeric_tools
    numeric_tools.each do |path|
      source = File.read(path)
      assert_includes source, 'def enableVCB?', path
    end
  end

  def test_tools_with_transient_draw_overlays_define_native_extents
    tool_files = Dir[File.join(TOOLS_ROOT, '**', 'tools', '*.rb')]
    draw_tools = tool_files.select { |path| File.read(path).match?(/^\s*def draw\(view\)/) }

    refute_empty draw_tools
    draw_tools.each do |path|
      assert_includes File.read(path), 'def getExtents', path
    end
  end

  def test_every_tool_with_transient_draw_overlay_has_a_lifecycle_cleanup
    tool_files = Dir[File.join(TOOLS_ROOT, '**', 'tools', '*.rb')]
    draw_tools = tool_files.select { |path| File.read(path).match?(/^\s*def draw\(view\)/) }

    refute_empty draw_tools
    draw_tools.each do |path|
      assert_includes File.read(path), 'def deactivate(view)', path
    end
  end

  def test_wall_draw_clears_preview_when_a_click_has_no_valid_input_point
    source = File.read(File.join(TOOLS_ROOT, 'architecture', 'tools', 'wall_tool.rb'))
    assert_includes source, 'unless @input_point.valid?'
    assert_includes source, '@hover_point = nil'
    assert_includes source, '@preview = nil'
    assert_includes source, '@plane.project(Core::Units.point_to_mm(@input_point.position))'
    assert_includes source, "view.draw_text(@hover_point, 'Click to start Smart Wall')"
    assert_includes source, 'return unless key == 16 && !repeat # Shift'
    %w[floor_tool room_tool ceiling_tool].each do |tool_name|
      tool_source = File.read(File.join(TOOLS_ROOT, 'architecture', 'tools', "#{tool_name}.rb"))
      assert_includes tool_source, '@plane.project(Core::Units.point_to_mm(@input_point.position))', tool_name
    end
  end

  def test_plan_edit_tools_clear_transient_state_when_deactivated
    lifecycle_tools = %w[
      architecture/tools/wall_tool.rb
      architecture/tools/wall_edit_tool.rb
      architecture/tools/floor_tool.rb
      architecture/tools/room_tool.rb
      architecture/tools/ceiling_tool.rb
      architecture/tools/boundary_edit_tool.rb
      opening/tools/opening_tool.rb
      opening/tools/opening_edit_tool.rb
      door_window/tools/place_tool.rb
      surface/tools/boundary_tool.rb
      roof/tools/boundary_tool.rb
      drainage/tools/manhole_tool.rb
      drainage/tools/route_node_tool.rb
      interior/tools/cabinet_run_tool.rb
      structure/tools/column_tool.rb
      structure/tools/beam_tool.rb
      structure/tools/grid_tool.rb
    ].map { |relative_path| File.join(TOOLS_ROOT, relative_path) }

    lifecycle_tools.each do |path|
      assert File.file?(path), path
      assert_includes File.read(path), 'def deactivate(view)', path
    end
  end

  def test_hosted_plan_tools_accept_and_apply_an_active_level
    opening_tool = File.read(File.join(TOOLS_ROOT, 'opening', 'tools', 'opening_tool.rb'))
    door_window_tool = File.read(File.join(TOOLS_ROOT, 'door_window', 'tools', 'place_tool.rb'))
    registration = File.read(File.join(TOOLS_ROOT, 'architecture', 'registration.rb'))

    assert_includes opening_tool, 'level_id: nil'
    assert_includes opening_tool, "PlanSelectionFilter.new(object_types: ['architecture.wall'], level_id: @level_id)"
    assert_includes opening_tool, 'input[:level_id] = @level_id if @level_id'
    assert_includes door_window_tool, 'level_id: nil'
    assert_includes door_window_tool, "PlanSelectionFilter.new(object_types: ['architecture.wall'], level_id: @level_id)"
    assert_includes door_window_tool, 'point_mm = placement_point_mm(target)'
    assert_includes door_window_tool, 'def host_wall_for(target)'
    assert_includes door_window_tool, "Sketchup.set_status_text('Pick a valid ConstructFlow plan point.', SB_PROMPT)"
    wall_edit_tool = File.read(File.join(TOOLS_ROOT, 'architecture', 'tools', 'wall_edit_tool.rb'))
    assert_includes wall_edit_tool, 'level_id: nil'
    assert_includes wall_edit_tool, "PlanSelectionFilter.new(object_types: ['architecture.wall'], level_id: @active_level_id)"
    assert_includes wall_edit_tool, 'return unless key == 16 && !repeat'
    assert_includes wall_edit_tool, 'if key == 84 && !repeat && @wall # T'
    assert_includes wall_edit_tool, 'if key == 70 && !repeat && @wall # F'
    assert_includes wall_edit_tool, "'ChangeWallType'"
    assert_includes wall_edit_tool, 'ConstructFlow Change Smart Wall Type'
    assert_includes wall_edit_tool, 'def typed_stretch_length(text)'
    assert_includes wall_edit_tool, 'relative wall length must remain greater than zero'
    assert_includes wall_edit_tool, '@plane.project(Core::Units.point_to_mm(@input_point.position))'
    assert_includes wall_edit_tool, '@plane = Core::PlanLevelContext.new(@runtime, @level_id)'
    assert_includes wall_edit_tool, '@hover_definition = @hover_wall && WallRepository.new.read(@hover_wall.entity)'
    assert_includes wall_edit_tool, "label = @copy_mode ? 'Click Smart Wall to copy' : 'Click Smart Wall to edit'"
    boundary_tool = File.read(File.join(TOOLS_ROOT, 'architecture', 'tools', 'boundary_edit_tool.rb'))
    assert_includes boundary_tool, 'level_id: nil'
    assert_includes boundary_tool, 'level_id: @active_level_id'
    assert_includes boundary_tool, 'PlanSelectionFilter.new(object_types: [@object_type], level_id: @active_level_id)'
    assert_includes boundary_tool, '@plane.project(Core::Units.point_to_mm(@input_point.position))'
    assert_includes boundary_tool, '@plane = Core::PlanLevelContext.new(@runtime, @level_id)'
    assert_includes boundary_tool, '@hover_definition = @hover_object && @repository.public_send(@read_method, @hover_object.entity)'
    assert_includes boundary_tool, 'view.draw_text(points[points.length / 2], "Click #{@label} to edit")'
    opening_edit_tool = File.read(File.join(TOOLS_ROOT, 'opening', 'tools', 'opening_edit_tool.rb'))
    opening_registration = File.read(File.join(TOOLS_ROOT, 'opening', 'registration.rb'))
    assert_includes opening_edit_tool, 'level_id: nil'
    assert_includes opening_edit_tool, "PlanSelectionFilter.new(object_types: ['architecture.wall'], level_id: @active_level_id)"
    assert_includes opening_edit_tool, 'def level_compatible_opening?(object)'
    assert_includes opening_edit_tool, 'def set_hover_state(view, x, y)'
    assert_includes opening_edit_tool, "view.drawing_color = @opening ? 'blue' : 'cyan'"
    assert_includes opening_edit_tool, 'input[:level_id] = @active_level_id if @active_level_id'
    assert_includes opening_registration, 'OpeningEditTool.new(runtime: runtime, level_id: values[0])'
    assert_includes opening_registration, 'def host_level_error(input, host)'
    assert_includes opening_registration, 'host Smart Wall is not on the requested plan level'
    assert_includes opening_registration, 'level_error = host_level_error(input, replacement)'
    assert_includes opening_registration, 'level_error = host_level_error(input, host)'
    assert_includes door_window_tool, '@input[:level_id] = @level_id if @level_id'
    door_window_registration = File.read(File.join(TOOLS_ROOT, 'door_window', 'registration.rb'))
    assert_includes door_window_registration, 'host Smart Wall is not on the requested plan level'
    assert_includes door_window_registration, 'def opening_host_level_error(input, opening, runtime)'
    assert_includes door_window_registration, 'Opening host wall is not on the requested plan level'
    assert_includes registration, 'level_id: level_id'
    assert_includes registration, 'level_id: values[2]'
    assert_includes registration, 'WallEditTool.new(runtime: runtime, level_id: values[0])'
    assert_includes registration, 'WallEditTool.new(runtime: runtime, copy: true, level_id: values[0])'
    assert_includes registration, "command: 'ModifyFloorBoundary', label: 'Floor', level_id: values[0]"
    assert_includes registration, "command: 'ModifyRoomBoundary', label: 'Room', level_id: values[0]"
    assert_includes registration, "command: 'ModifyCeilingBoundary', label: 'Ceiling', level_id: values[0]"
    architecture_source = File.read(File.join(TOOLS_ROOT, 'architecture', 'registration.rb'))
    assert_includes architecture_source, "id: 'architecture.wall.schedule'"
    assert_includes architecture_source, "'EditWallSchedule'"
    runtime_source = File.read(File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'main.rb'))
    assert_includes runtime_source, "@menu.add_item('Create Level')"
    assert_includes runtime_source, "@commands.execute(\n              'CreateLevel'"
    assert_includes runtime_source, "@menu.add_item('Edit Level')"
    assert_includes runtime_source, "@commands.execute(\n              'ModifyLevel'"
    assert_includes runtime_source, "@menu.add_item('Show Levels')"
    assert_includes runtime_source, "@menu.add_item('Edit Project')"
    assert_includes runtime_source, "'UpdateProjectMetadata'"

    {
      'surface/tools/boundary_tool.rb' => '@plane.project(Core::Units.point_to_mm(@input_point.position))',
      'structure/tools/grid_tool.rb' => '@plane.project(Core::Units.point_to_mm(@input_point.position))',
      'structure/tools/beam_tool.rb' => 'PlanLevelContext.new(runtime, @level_id, offset_mm: @base_offset_mm)',
      'structure/tools/column_tool.rb' => 'PlanLevelContext.new(runtime, @base_level_id, offset_mm: @base_offset_mm)',
      'opening/tools/opening_tool.rb' => '@plane.project(Core::Units.point_to_mm(@input_point.position))',
      'opening/tools/opening_edit_tool.rb' => '@plane.project(Core::Units.point_to_mm(@input_point.position))',
      'door_window/tools/place_tool.rb' => '@plane.project(Core::Units.point_to_mm(@input_point.position))'
    }.each do |relative_path, contract|
      assert_includes File.read(File.join(TOOLS_ROOT, relative_path)), contract, relative_path
    end
  end
end
