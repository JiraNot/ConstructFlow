# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class DrawingIssueSheetRequest
        attr_reader :preset_id, :options

        def initialize(preset_id:, options: {})
          @preset_id = required(preset_id, 'issue sheet preset_id')
          @options = symbolize_keys(options || {}).freeze
          freeze
        end

        def to_h
          { 'preset_id' => preset_id, 'options' => stringify_keys(options) }.freeze
        end

        private

        def symbolize_keys(value)
          value.each_with_object({}) { |(key, item), result| result[key.to_sym] = item }
        end

        def stringify_keys(value)
          value.each_with_object({}) { |(key, item), result| result[key.to_s] = item }
        end

        def required(value, label)
          text = value.to_s
          raise ArgumentError, "#{label} required" if text.empty?
          text
        end
      end

      class DrawingIssueSet
        FORMAT = 'constructflow.drawing_issue_set.v1'

        attr_reader :id, :name, :revision, :issue_status, :template_scope_id, :template_use_case, :sheets

        def initialize(id:, name:, revision:, issue_status:, sheets:, template_scope_id: '', template_use_case: 'construction')
          @id = required(id, 'issue set id')
          @name = required(name, 'issue set name')
          @revision = required(revision, 'issue set revision')
          @issue_status = required(issue_status, 'issue set status')
          @template_scope_id = template_scope_id.to_s
          @template_use_case = required(template_use_case, 'template use case')
          @sheets = Array(sheets).dup.freeze
          raise ArgumentError, 'issue set requires at least one sheet' if @sheets.empty?
          raise ArgumentError, 'issue set sheets must be DrawingIssueSheetRequest values' unless @sheets.all? { |item| item.is_a?(DrawingIssueSheetRequest) }
          freeze
        end

        def to_h
          {
            'format' => FORMAT,
            'id' => id,
            'name' => name,
            'revision' => revision,
            'issue_status' => issue_status,
            'template_scope_id' => template_scope_id,
            'template_use_case' => template_use_case,
            'sheets' => sheets.map(&:to_h).freeze
          }.freeze
        end

        private

        def required(value, label)
          text = value.to_s
          raise ArgumentError, "#{label} required" if text.empty?
          text
        end
      end
    end
  end
end
