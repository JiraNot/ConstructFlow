# frozen_string_literal: true

require_relative 'layout_template_placeholder_map'

module JiraNot
  module ConstructFlow
    module Core
      class LayoutExportPlanBuilder
        DEFAULT_VIEWPORT_BOUNDS_MM = [15.0, 15.0, 390.0, 238.0].freeze
        TITLE_BLOCK_MARGIN_MM = 10.0
        TITLE_BLOCK_WIDTH_MM = 180.0
        TITLE_BLOCK_HEIGHT_MM = 28.0

        def initialize(runtime:, lineweight_profile: VectorLineweightProfile.new)
          @runtime = runtime
          @lineweight_profile = lineweight_profile
        end

        def build_for_preset(preset_id, sheet_id: nil, sheet_number: nil, sheet_title: nil,
                             paper_size: 'A3', orientation: 'landscape', template_key: 'constructflow.standard',
                             revision: 'P01', issue_status: 'working', viewport_bounds_mm: DEFAULT_VIEWPORT_BOUNDS_MM,
                             render_mode: 'vector', project_name: '', project_number: '', drawn_by: '', checked_by: '',
                             revisions: nil, placeholder_tokens: nil, template_strategy: 'prefer_template',
                             revision_placeholder_prefix: 'CF:REV')
          preset = @runtime.drawing_view_presets.fetch!(preset_id)
          viewport = DrawingViewportSpec.new(
            id: "viewport.#{preset.id}",
            scene_name: preset.scene_name,
            preset_id: preset.id,
            scale: preset.scale,
            bounds_mm: viewport_bounds_mm,
            render_mode: render_mode,
            lineweight_profile: @lineweight_profile.id
          )

          sheet = DrawingSheetSpec.new(
            id: sheet_id || "sheet.#{preset.id}",
            number: sheet_number || default_sheet_number(preset),
            title: sheet_title || preset.name,
            paper_size: paper_size,
            orientation: orientation,
            template_key: template_key,
            revision: revision,
            issue_status: issue_status,
            viewports: [viewport]
          )

          placeholder_map = LayoutTemplatePlaceholderMap.new(
            template_key: template_key,
            field_tokens: placeholder_tokens || LayoutTemplatePlaceholderMap::DEFAULT_FIELD_TOKENS,
            revision_prefix: revision_placeholder_prefix,
            strategy: template_strategy
          )

          title_block = TitleBlockSpec.new(
            template_key: template_key,
            bounds_mm: title_block_bounds(sheet.page_size_mm),
            fields: {
              'project_name' => project_name,
              'project_number' => project_number,
              'drawing_title' => sheet.title,
              'sheet_number' => sheet.number,
              'scale' => preset.scale,
              'revision' => sheet.revision,
              'issue_status' => sheet.issue_status,
              'drawn_by' => drawn_by,
              'checked_by' => checked_by,
              'drawing_family' => preset.drawing_family
            },
            placeholder_map: placeholder_map
          )

          revision_rows = normalize_revisions(revisions, revision: sheet.revision, issue_status: sheet.issue_status)

          {
            'format' => 'constructflow.layout_export_plan.v1',
            'source' => {
              'preset_id' => preset.id,
              'scene_name' => preset.scene_name,
              'drawing_family' => preset.drawing_family,
              'phase_view' => preset.phase_view,
              'lod' => preset.lod,
              'scale' => preset.scale
            }.freeze,
            'sheet' => sheet.to_h.merge(
              'title_block' => title_block.to_h,
              'revisions' => revision_rows.map(&:to_h).freeze
            ).freeze,
            'vector_style' => @lineweight_profile.to_h,
            'native_layout_status' => 'planned',
            'export_targets' => %w[layout pdf].freeze
          }.freeze
        end

        private

        def title_block_bounds(page_size_mm)
          page_width, page_height = Array(page_size_mm).map { |value| Float(value) }
          width = [TITLE_BLOCK_WIDTH_MM, page_width - (TITLE_BLOCK_MARGIN_MM * 2.0)].min
          height = [TITLE_BLOCK_HEIGHT_MM, page_height - (TITLE_BLOCK_MARGIN_MM * 2.0)].min
          [
            page_width - TITLE_BLOCK_MARGIN_MM - width,
            page_height - TITLE_BLOCK_MARGIN_MM - height,
            width,
            height
          ]
        end

        def normalize_revisions(values, revision:, issue_status:)
          source = values.nil? ? [{ 'code' => revision, 'status' => issue_status }] : Array(values)
          source.map do |value|
            next value if value.is_a?(RevisionEntry)

            data = stringify_keys(value || {})
            RevisionEntry.new(
              code: data['code'] || revision,
              description: data['description'],
              date: data['date'],
              status: data['status'] || issue_status,
              author: data['author']
            )
          end.freeze
        end

        def stringify_keys(value)
          value.each_with_object({}) { |(key, item), result| result[key.to_s] = item }
        end

        def default_sheet_number(preset)
          family = preset.drawing_family.to_s
          return 'P-101' if family == 'plumbing_drainage_plan'
          'D-101'
        end
      end
    end
  end
end
