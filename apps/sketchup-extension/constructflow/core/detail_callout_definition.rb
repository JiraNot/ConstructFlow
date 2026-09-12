# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class DetailCalloutDefinition
        attr_reader :id, :detail_number, :sheet_number, :source_sheet_number,
                    :title, :scale, :location_mm, :reference_object_ids

        def initialize(id:, detail_number:, sheet_number:, source_sheet_number:,
                       title:, scale: '1:10', location_mm: [0.0, 0.0, 0.0], reference_object_ids: [])
          @id = id.to_s.strip
          @detail_number = detail_number.to_s.strip
          @sheet_number = sheet_number.to_s.strip
          @source_sheet_number = source_sheet_number.to_s.strip
          @title = title.to_s.strip
          @scale = scale.to_s.strip
          @location_mm = Array(location_mm).map { |v| Float(v) }.freeze
          @reference_object_ids = Array(reference_object_ids).map(&:to_s).uniq.sort.freeze
          freeze
        end

        def errors
          result = []
          result << 'callout id required' if id.empty?
          result << 'detail number required' if detail_number.empty?
          result << 'target sheet number required' if sheet_number.empty?
          result << 'title required' if title.empty?
          result << 'location must be 3 coordinates' unless location_mm.length == 3
          result.freeze
        end

        def valid?
          errors.empty?
        end

        def callout_tag
          "#{detail_number}/#{sheet_number}"
        end

        def to_h
          {
            'id' => id,
            'detail_number' => detail_number,
            'sheet_number' => sheet_number,
            'source_sheet_number' => source_sheet_number,
            'title' => title,
            'scale' => scale,
            'location_mm' => location_mm,
            'reference_object_ids' => reference_object_ids,
            'callout_tag' => callout_tag
          }
        end

        def self.from_h(value)
          data = value || {}
          new(
            id: data['id'] || data[:id],
            detail_number: data['detail_number'] || data[:detail_number],
            sheet_number: data['sheet_number'] || data[:sheet_number],
            source_sheet_number: data['source_sheet_number'] || data[:source_sheet_number],
            title: data['title'] || data[:title],
            scale: data['scale'] || data[:scale] || '1:10',
            location_mm: data['location_mm'] || data[:location_mm] || [0.0, 0.0, 0.0],
            reference_object_ids: data['reference_object_ids'] || data[:reference_object_ids] || []
          )
        end
      end
    end
  end
end
