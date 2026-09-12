# frozen_string_literal: true

require_relative '../test_helper'
require File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'modules', 'architecture', 'registration')

class RoomScheduleIntegrationTest < Minitest::Test
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
    entity = FakeEntity.new
    JiraNot::ConstructFlow::Architecture::RoomRepository.new.write(
      entity,
      JiraNot::ConstructFlow::Architecture::RoomDefinition.new(
        boundary_mm: [[0, 0, 0], [4000, 0, 0], [4000, 3000, 0]],
        name: 'Kitchen', number: 'R01', program: 'residential', usage: 'living'
      )
    )
    manager = JiraNot::ConstructFlow::Core::SmartObjectManager.new(model: FakeModel.new)
    @object = manager.create(entity: entity, type: 'architecture.room', owner_module: 'constructflow.architecture')
    @commands = Commands.new
    @runtime = Runtime.new(FakeModel.new, manager, @commands, Project.new('project-1'))
  end

  def test_room_schedule_exposes_calculated_fields_and_delegates_metadata_edit
    editor = JiraNot::ConstructFlow::Architecture::Registration.schedule_editor(@runtime)
    row = editor.rows([@object]).first

    assert_in_delta 6.0, row['values']['area_m2'], 0.001
    assert_raises(ArgumentError) { editor.edit(row: row, field_id: 'area_m2', value: 9) }
    updated = editor.edit(row: row, field_id: 'number', value: 'R02')

    assert_equal 'R02', updated['values']['number']
    assert_equal 'EditRoomSchedule', @commands.calls.first[:name]
    assert_equal({ object_id: @object.id, field_id: 'number', value: 'R02' }, @commands.calls.first[:input])
  end
end
