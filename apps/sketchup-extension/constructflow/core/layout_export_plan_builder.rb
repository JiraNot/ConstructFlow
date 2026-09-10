# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class LayoutExportPlanBuilder
        DEFAULT_VIEWPORT_BOUNDS_MM = [15.0, 15.0, 390.0, 255.0].freeze

        def initialize(runtime:, lineweight_profile: VectorLineweightProfile.new)
          @runtime = runtime
          @lineweight_profile = lineweight_profile
        end

        def build_for_preset(preset_id, sheet_id: nil, sheet_number: nil, sheet_title: nil,
                             paper_size: 'A3', orientation: 'landscape', template_key: 'constructflow.standard',
                             revision: 'P01', issue_status: 'working', viewport_bounds_mm: DEFAULT_VIEWPORT_BOUNDS_MM,
                             render_mode: 'vector')
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
            'sheet' => sheet.to_h,
            'vector_style' => @lineweight_profile.to_h,
            'native_layout_status' => 'planned',
            'export_targets' => %w[layout pdf].freeze
          }.freeze
        end

        private

        def default_sheet_number(preset)
          family = preset.drawing_family.to_s
          return 'P-101' if family == 'plumbing_drainage_plan'
          'D-101'
        end
      end
    end
  end
end
