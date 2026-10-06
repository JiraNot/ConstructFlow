# frozen_string_literal: true

require_relative '../test_helper'

class ToolPropertiesTest < Minitest::Test
  Props = JiraNot::ConstructFlow::Core::ToolProperties

  COMMAND_CODES = %w[RF GT PB SF LV PH].freeze
  ROOF_CODES = %w[FRM MFR HGR AR].freeze

  def test_schema_defines_well_formed_fields_for_every_tool
    assert_operator Props::SCHEMA.size, :>=, Props::DRAWING_CODES.size + COMMAND_CODES.size

    Props::SCHEMA.each do |code, fields|
      refute_empty fields, "Tool #{code} must declare at least one field"
      fields.each do |field|
        %i[key label default type].each do |attribute|
          assert field.key?(attribute), "Field #{field.inspect} in #{code} is missing #{attribute}"
        end
        refute_nil field[:key], "Tool #{code} has a field without a key"
        refute_empty field[:label], "Tool #{code}/#{field[:key]} needs a dialog label"
        if field[:type] == :choice
          assert field[:choices].is_a?(Array) && !field[:choices].empty?,
                 "Choice field #{code}/#{field[:key]} must declare choices"
          assert_includes field[:choices], field[:default],
                          "Choice field #{code}/#{field[:key]} default must be one of its choices"
        end
      end
    end
  end

  def test_every_drawing_and_command_tool_has_a_schema
    (Props::DRAWING_CODES + COMMAND_CODES).each do |code|
      refute_empty Props.schema_for(code), "Missing parameter schema for tool #{code}"
    end
  end

  def test_defaults_fall_back_to_schema_when_nothing_saved
    runtime = build_test_runtime
    values = Props.defaults_for(runtime, 'WA')

    assert_equal 100.0, values[:thickness_mm]
    assert_equal 2800.0, values[:height_mm]
    assert_equal '', values[:level_id]
  end

  def test_saved_defaults_round_trip_on_the_model
    runtime = build_test_runtime
    Props.save_defaults(runtime, 'WA', { thickness_mm: 150.0, height_mm: 3200.0, level_id: 'level_2' })

    values = Props.defaults_for(runtime, 'WA')
    assert_equal 150.0, values[:thickness_mm]
    assert_equal 3200.0, values[:height_mm]
    assert_equal 'level_2', values[:level_id]

    # Other tools keep their own defaults, unaffected by WA's saved values.
    assert_equal 200.0, Props.defaults_for(runtime, 'CL')[:section_width_mm]
  end

  def test_saved_values_are_coerced_back_to_field_types
    runtime = build_test_runtime
    Props.save_defaults(runtime, 'CB', { width_mm: '2000', module_count: '5' })

    values = Props.defaults_for(runtime, 'CB')
    assert_equal 2000.0, values[:width_mm]
    assert_equal 5, values[:module_count]
  end

  def test_collect_without_prompt_returns_defaults_and_needs_no_ui
    runtime = build_test_runtime
    values = Props.collect(runtime, 'OP', prompt: false)

    assert_equal 900.0, values[:width_mm]
    assert_equal 2100.0, values[:height_mm]
    assert_equal 0.0, values[:sill_mm]
  end

  def test_collect_prompt_confirm_coerces_values_and_saves_defaults
    runtime = build_test_runtime

    with_ui_inputbox(['0.25', '3.2', 'level_x']) do
      values = Props.collect(runtime, 'WA', prompt: true, title: 'Wall')
      assert_equal 250.0, values[:thickness_mm]
      assert_equal 3200.0, values[:height_mm]
      assert_equal 'level_x', values[:level_id]
    end

    # The confirmed values become the next dialog's defaults.
    assert_equal 250.0, Props.defaults_for(runtime, 'WA')[:thickness_mm]
  end

  def test_collect_prompt_cancel_returns_nil_and_keeps_old_defaults
    runtime = build_test_runtime

    with_ui_inputbox(nil) do
      assert_nil Props.collect(runtime, 'WA', prompt: true, title: 'Wall')
    end

    assert_equal 100.0, Props.defaults_for(runtime, 'WA')[:thickness_mm]
  end

  def test_unparseable_numbers_fall_back_to_the_schema_default
    runtime = build_test_runtime

    with_ui_inputbox(['ไม่ใช่ตัวเลข', '', '']) do
      values = Props.collect(runtime, 'WA', prompt: true, title: 'Wall')
      assert_equal 100.0, values[:thickness_mm]
      assert_equal 2800.0, values[:height_mm]
    end
  end

  def test_optional_float_fields_accept_blank_as_nil
    runtime = build_test_runtime

    with_ui_inputbox(['0.6', '0.6', '', '', '']) do
      values = Props.collect(runtime, 'MH', prompt: true, title: 'Manhole')
      assert_equal 600.0, values[:size_width_mm]
      assert_nil values[:cover_level_mm]
      assert_nil values[:invert_in_mm]
    end
  end

  def test_roof_family_tools_open_a_properties_dialog
    ROOF_CODES.each do |code|
      assert Props.drawing?(code), "#{code} must be treated as a drawing tool so the dialog opens"
      refute_empty Props.schema_for(code), "#{code} needs a parameter schema"
    end
  end

  def test_roof_framing_collect_confirm_coerces_and_saves_defaults
    runtime = build_test_runtime

    with_ui_inputbox(['35', '1.2', '0.4', '0.9', 'shed']) do
      values = Props.collect(runtime, 'FRM', prompt: true, title: 'Roof Framing')
      assert_equal 35.0, values[:pitch_degrees]
      assert_equal 1200.0, values[:truss_spacing_mm]
      assert_equal 400.0, values[:purlin_spacing_mm]
      assert_equal 900.0, values[:overhang_mm]
      assert_equal 'shed', values[:roof_type]
    end

    assert_equal 35.0, Props.defaults_for(runtime, 'FRM')[:pitch_degrees]
    assert_equal 'shed', Props.defaults_for(runtime, 'FRM')[:roof_type]
  end

  def test_roof_framing_collect_cancel_returns_nil
    runtime = build_test_runtime

    with_ui_inputbox(nil) do
      assert_nil Props.collect(runtime, 'FRM', prompt: true, title: 'Roof Framing')
    end
  end

  def test_revit_auto_roof_attach_walls_is_a_boolean_choice
    field = Props.schema_for('AR').find { |f| f[:key] == :attach_walls }

    assert_equal %w[true false], field[:choices]
    assert_includes field[:choices], field[:default]
  end

  def test_hip_gable_roof_exposes_form_choices
    field = Props.schema_for('HGR').find { |f| f[:key] == :form }

    assert_equal %w[hip gable shed], field[:choices]
  end

  private

  # Temporarily installs UI.inputbox so the dialog path can be exercised
  # without SketchUp. Restores the previous UI module/method afterwards.
  def with_ui_inputbox(result)
    added_ui = !Object.const_defined?(:UI)
    Object.const_set(:UI, Module.new) if added_ui
    ui = Object.const_get(:UI)
    had_method = ui.respond_to?(:inputbox)
    original = ui.method(:inputbox) if had_method

    ui.define_singleton_method(:inputbox) { |*_args| result }
    yield
  ensure
    if had_method
      ui.define_singleton_method(:inputbox, original)
    elsif ui.singleton_class.method_defined?(:inputbox)
      ui.singleton_class.send(:remove_method, :inputbox)
    end
    Object.send(:remove_const, :UI) if added_ui
  end
end
