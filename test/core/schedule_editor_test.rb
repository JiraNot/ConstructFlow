# frozen_string_literal: true

require_relative '../test_helper'

class ScheduleEditorTest < Minitest::Test
  Core = JiraNot::ConstructFlow::Core

  def setup
    @schema = Core::ScheduleDefinition.new(
      id: 'door.schedule', name: 'Door Schedule', object_type: 'door_window.instance', columns: [
        { id: 'mark', label: 'Mark', field_type: 'text', editable: true, scope: 'instance' },
        { id: 'width', label: 'Width', field_type: 'number', editable: false, calculated: true },
        { id: 'type_id', label: 'Type', field_type: 'text', editable: true, scope: 'type' }
      ]
    )
    @updates = []
    @editor = Core::ScheduleEditor.new(
      schema: @schema,
      row_provider: ->(object) { { mark: object[:mark], width: object[:width], type_id: object[:type_id] } },
      updater: ->(**change) { @updates << change; { status: 'success' } }
    )
  end

  def test_builds_traceable_rows_and_updates_editable_instance_field
    rows = @editor.rows([
      { id: 'door-1', type: 'door_window.instance', mark: 'D01', width: 900, type_id: 'D900' },
      { id: 'wall-1', type: 'architecture.wall', mark: 'W01', width: 100, type_id: 'W100' }
    ])

    updated = @editor.edit(row: rows.first, field_id: 'mark', value: 'D02')

    assert_equal ['door-1'], rows.map { |row| row['object_id'] }
    assert_equal 'D02', updated['values']['mark']
    assert_equal({ object_id: 'door-1', field_id: 'mark', value: 'D02', scope: 'instance' }, @updates.first)
  end

  def test_protects_calculated_fields_and_normalizes_type_scope_values
    row = @editor.rows([{ id: 'door-1', type: 'door_window.instance', mark: 'D01', width: 900, type_id: 'D900' }]).first

    assert_raises(ArgumentError) { @editor.edit(row: row, field_id: 'width', value: 1000) }
    @editor.edit(row: row, field_id: 'type_id', value: :D1000)
    assert_equal 'type', @updates.first[:scope]
  end
end
