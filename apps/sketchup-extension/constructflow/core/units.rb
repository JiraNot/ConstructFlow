# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module Units
        MM_PER_INCH = 25.4

        @active_unit = :meter

        module_function

        def active_unit
          :meter
        end

        def active_unit=(unit)
          raise ArgumentError, 'ConstructFlow uses meters as its only user-facing length unit' unless unit.to_sym == :meter

          @active_unit = :meter
        end

        # Model properties and VCB use meters; persisted command/data fields
        # remain in mm to keep existing models and domain APIs compatible.
        def configure_model(model)
          return false unless model && model.respond_to?(:options) && defined?(Length)
          return false unless defined?(Length::Decimal) && defined?(Length::Meter)

          units = model.options['UnitsOptions']
          return false unless units

          return false unless units.respond_to?(:[]=)

          units['LengthFormat'] = Length::Decimal
          units['LengthUnit'] = Length::Meter
          units['AreaUnit'] = Length::SquareMeter if defined?(Length::SquareMeter)
          units['VolumeUnit'] = Length::CubicMeter if defined?(Length::CubicMeter)
          units['LengthPrecision'] = 3
          units['SuppressUnitsDisplay'] = false
          @active_unit = :meter
          true
        rescue StandardError
          false
        end

        # Adapter for legacy dialogs with mm-based domain values. Inputs with
        # mm labels (or explicitly selected indices) are shown in meters and
        # converted back to mm; other prompts keep their original values.
        def meter_inputbox(prompts, defaults, list_or_title = nil, title = nil, millimeter_indices: [])
          labels = Array(prompts).map(&:to_s)
          values = Array(defaults)
          raise ArgumentError, 'input defaults must match the number of prompts' unless labels.length == values.length

          explicit = Array(millimeter_indices).map(&:to_i)
          converted = labels.each_with_index.map { |label, index| explicit.include?(index) || millimeter_label?(label) }
          visible_prompts = labels.each_with_index.map { |label, index| converted[index] ? meter_label(label) : label }
          visible_defaults = values.each_with_index.map do |value, index|
            converted[index] ? mm_default_to_m(value) : value
          end

          dialog_title = title
          choice_list = list_or_title
          if dialog_title.nil? && list_or_title.is_a?(String) && !list_or_title.include?('|')
            dialog_title = list_or_title
            choice_list = nil
          end
          if dialog_title.nil? && choice_list.nil?
            result = UI.inputbox(visible_prompts, visible_defaults)
          elsif dialog_title.nil?
            result = UI.inputbox(visible_prompts, visible_defaults, choice_list)
          else
            result = UI.inputbox(visible_prompts, visible_defaults, choice_list, dialog_title)
          end
          return result unless result.is_a?(Array)

          result.each_with_index.map do |value, index|
            next value unless converted[index]
            next value if value.nil? || value.to_s.strip.empty?

            begin
              m_input_to_mm(value)
            rescue ArgumentError
              raise if value.to_s.match?(/mm|cm|in|ft|มม/i)

              value
            end
          end
        end

        def millimeter_label?(label)
          /mm|มม/i.match?(label.to_s)
        end

        def meter_label(label)
          label.to_s.gsub(/\bmm\b/i, 'm').gsub(/\(มม\.?\)/i, '(m)').gsub('มม.', 'ม.').gsub('มม', 'ม')
        end

        def mm_default_to_m(value)
          return value if value.nil? || value == ''

          (Float(value) / 1000.0).to_s
        rescue ArgumentError, TypeError
          value
        end

        def m_input_to_mm(value, max_meters: nil)
          return value if value.nil? || value.to_s.strip.empty?

          text = value.to_s.strip
          if text.match?(/mm|cm|in|ft|มม/i)
            raise ArgumentError, 'กรุณาป้อนระยะเป็นเมตรเท่านั้น'
          end
          text = text[0...-1].rstrip if text.downcase.end_with?('m')

          meters = Float(text)
          if max_meters && meters.abs > Float(max_meters)
            raise ArgumentError, "ระยะต้องไม่เกิน #{max_meters} เมตร"
          end
          meters * 1000.0
        rescue ArgumentError, TypeError => error
          raise error if error.message.include?('เมตร')

          raise ArgumentError, "ระยะต้องป้อนเป็นเมตรเท่านั้น: #{value}"
        end

        def m_to_mm(value_m)
          Float(value_m) * 1000.0
        end

        def mm_to_m(value_mm)
          Float(value_mm) / 1000.0
        end

        def format_length(value_mm, unit: nil)
          format('%.2f m', mm_to_m(value_mm))
        end

        def format_dimension(value_mm)
          format('%.3f m', mm_to_m(value_mm))
        end

        def mm_to_su(value_mm)
          Float(value_mm) / MM_PER_INCH
        end

        def su_to_mm(value_su)
          Float(value_su) * MM_PER_INCH
        end

        def m_to_su(value_m)
          mm_to_su(Float(value_m) * 1000.0)
        end

        def su_to_m(value_su)
          Float(su_to_mm(value_su)) / 1000.0
        end

        def point_to_mm(point)
          [su_to_mm(point.x), su_to_mm(point.y), su_to_mm(point.z)]
        end

        def point_from_mm(values)
          values = Array(values)
          raise ArgumentError, 'point requires x, y, z' unless values.length >= 3

          [mm_to_su(values[0]), mm_to_su(values[1]), mm_to_su(values[2])]
        end
      end
    end
  end
end
