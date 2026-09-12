# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'door_window', 'registration')

class DoorWindowScheduleIntegrationTest < Minitest::Test
  Runtime = Struct.new(:active_model, :smart_objects, :commands, :project)
  Project = Struct.new(:project_id)

  class Commands
    attr_reader :calls

    def initialize
      @calls = []
    end

    def execute(name, input, project_id:)
      @calls << { name: name, input: input, project_id: project_id }
      { status: 'success' }
    end
  end

  def setup
    @model = FakeModel.new
    @manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: @model)
    @commands = Commands.new
    @runtime = Runtime.new(@model, @manager, @commands, Project.new('project-1'))
    @type = JiraNot::ConstructFlow::DoorWindow::DoorWindowType.new(
      id: 'window.fixed.900', name: 'Fixed Window 900', category: 'window', operation: 'fixed',
      width_mm: 900, height_mm: 1200, frame_material: 'aluminium'
    )
    JiraNot::ConstructFlow::DoorWindow::TypeRegistry.new(@model).register(@type)
    @entity = FakeEntity.new
    JiraNot::ConstructFlow::DoorWindow::InstanceRepository.new.write(
      @entity,
      JiraNot::ConstructFlow::DoorWindow::InstanceDefinition.new(
        type_id: @type.id, opening_object_id: 'opening-1', handing: 'default', schedule_mark: 'W01'
      )
    )
    @object = @manager.create(entity: @entity, type: 'door_window.instance', owner_module: 'constructflow.door_window')
  end

  def test_schedule_instance_edit_delegates_to_existing_domain_command
    editor = JiraNot::ConstructFlow::DoorWindow::Registration.schedule_editor(@runtime)
    row = editor.rows([@object]).first

    updated = editor.edit(row: row, field_id: 'schedule_mark', value: 'W02')

    assert_equal 'W02', updated['values']['schedule_mark']
    assert_equal 'ModifyDoorWindowInstance', @commands.calls.first[:name]
    assert_equal({ object_id: @object.id, 'schedule_mark' => 'W02' }, @commands.calls.first[:input])
  end

  def test_schedule_type_edit_delegates_to_type_command_and_calculated_fields_are_protected
    editor = JiraNot::ConstructFlow::DoorWindow::Registration.schedule_editor(@runtime)
    row = editor.rows([@object]).first

    assert_raises(ArgumentError) { editor.edit(row: row, field_id: 'area_mm2', value: 10) }
    editor.edit(row: row, field_id: 'frame_material', value: 'timber')

    assert_equal 'ChangeFrameSystem', @commands.calls.first[:name]
    assert_equal({ type_id: @type.id, frame_material: 'timber' }, @commands.calls.first[:input])
  end
end
