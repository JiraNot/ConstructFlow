# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Interior
      class NestingResultDefinition
        SCHEMA_VERSION = 1
        DEFAULT_SHEET_WIDTH_MM = 1220.0
        DEFAULT_SHEET_LENGTH_MM = 2440.0
        DEFAULT_SAW_KERF_MM = 4.0
        DEFAULT_TRIM_MARGIN_MM = 10.0

        attr_reader :cabinet_object_id, :sheet_width_mm, :sheet_length_mm,
                    :saw_kerf_mm, :trim_margin_mm, :sheets, :unplaced_parts

        def initialize(cabinet_object_id:, sheets:, unplaced_parts: [],
                       sheet_width_mm: DEFAULT_SHEET_WIDTH_MM,
                       sheet_length_mm: DEFAULT_SHEET_LENGTH_MM,
                       saw_kerf_mm: DEFAULT_SAW_KERF_MM,
                       trim_margin_mm: DEFAULT_TRIM_MARGIN_MM)
          @cabinet_object_id = cabinet_object_id.to_s
          @sheet_width_mm = Float(sheet_width_mm)
          @sheet_length_mm = Float(sheet_length_mm)
          @saw_kerf_mm = Float(saw_kerf_mm)
          @trim_margin_mm = Float(trim_margin_mm)
          @sheets = normalize_records(sheets).freeze
          @unplaced_parts = normalize_records(unplaced_parts).freeze
          freeze
        end

        def errors
          result = []
          result << 'cabinet object id required' if cabinet_object_id.empty?
          result << 'sheet width must be positive' unless sheet_width_mm.positive?
          result << 'sheet length must be positive' unless sheet_length_mm.positive?
          result << 'saw kerf cannot be negative' if saw_kerf_mm.negative?
          result << 'trim margin cannot be negative' if trim_margin_mm.negative?
          result << 'usable sheet width must be positive' unless usable_width_mm.positive?
          result << 'usable sheet length must be positive' unless usable_length_mm.positive?
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def usable_width_mm
          sheet_width_mm - (2.0 * trim_margin_mm)
        end

        def usable_length_mm
          sheet_length_mm - (2.0 * trim_margin_mm)
        end

        def sheet_area_mm2
          sheet_width_mm * sheet_length_mm
        end

        def total_sheets
          sheets.length
        end

        def sheets_by_material
          sheets.group_by { |s| [s['material_id'], s['thickness_mm']] }
        end

        def total_used_area_mm2
          sheets.sum { |s| Float(s['used_area_mm2'] || 0.0) }
        end

        def total_sheet_area_mm2
          total_sheets * sheet_area_mm2
        end

        def overall_utilization_pct
          return 0.0 if total_sheet_area_mm2 <= 0.0

          ((total_used_area_mm2 / total_sheet_area_mm2) * 100.0).round(2)
        end

        def scrap_pct
          return 0.0 if total_sheet_area_mm2 <= 0.0

          (100.0 - overall_utilization_pct).round(2)
        end

        def to_h
          {
            'schema_version' => SCHEMA_VERSION,
            'cabinet_object_id' => cabinet_object_id,
            'sheet_width_mm' => sheet_width_mm,
            'sheet_length_mm' => sheet_length_mm,
            'saw_kerf_mm' => saw_kerf_mm,
            'trim_margin_mm' => trim_margin_mm,
            'total_sheets' => total_sheets,
            'overall_utilization_pct' => overall_utilization_pct,
            'scrap_pct' => scrap_pct,
            'sheets' => sheets,
            'unplaced_parts' => unplaced_parts
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            cabinet_object_id: data['cabinet_object_id'] || data[:cabinet_object_id],
            sheet_width_mm: data['sheet_width_mm'] || data[:sheet_width_mm] || DEFAULT_SHEET_WIDTH_MM,
            sheet_length_mm: data['sheet_length_mm'] || data[:sheet_length_mm] || DEFAULT_SHEET_LENGTH_MM,
            saw_kerf_mm: data['saw_kerf_mm'] || data[:saw_kerf_mm] || DEFAULT_SAW_KERF_MM,
            trim_margin_mm: data['trim_margin_mm'] || data[:trim_margin_mm] || DEFAULT_TRIM_MARGIN_MM,
            sheets: data['sheets'] || data[:sheets] || [],
            unplaced_parts: data['unplaced_parts'] || data[:unplaced_parts] || []
          )
        end

        private

        def normalize_records(values)
          Array(values).map do |record|
            normalize_hash(record).freeze
          end
        end

        def normalize_hash(value)
          value.each_with_object({}) do |(key, item), result|
            result[key.to_s] = case item
                               when Hash then normalize_hash(item).freeze
                               when Array then item.map { |entry| entry.is_a?(Hash) ? normalize_hash(entry).freeze : entry }.freeze
                               else item
                               end
          end
        end
      end
    end
  end
end
