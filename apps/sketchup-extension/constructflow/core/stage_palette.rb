# frozen_string_literal: true

require_relative 'i18n'
require_relative 'tool_catalog'
require_relative 'shortcut_manager'

module JiraNot
  module ConstructFlow
    module Core
      # Compact HtmlDialog "flyout" for one workflow stage.
      #
      # Native SketchUp toolbars cannot host flyout buttons, so the toolbar
      # keeps just one button per stage and opens this palette instead. It
      # renders the stage's tools as icon tiles; picking one runs the tool
      # exactly like clicking its dedicated toolbar button would.
      module StagePalette
        module_function

        def open(runtime, stage_key)
          return nil unless defined?(UI) && defined?(UI::HtmlDialog)

          stage_key = stage_key.to_s
          @runtime = runtime

          if @dialog && @dialog.visible?
            @dialog.set_html(build_html(stage_key))
            @dialog.bring_to_front
            return @dialog
          end

          @dialog = build_dialog(stage_key)
          @dialog.add_action_callback('run_tool') { |_dialog, code| run_tool(runtime, code) }
          @dialog.add_action_callback('close_palette') { |_dialog, _params| close }
          @dialog.set_html(build_html(stage_key))
          @dialog.show
          @dialog
        end

        def close
          @dialog&.close
          @dialog = nil
        end

        def visible?
          @dialog&.visible? || false
        end

        def run_tool(runtime, code)
          close
          ShortcutManager.execute(code, runtime, prompt: true)
        end

        def build_dialog(stage_key)
          stage = ToolCatalog.stage(stage_key)
          props = {
            dialog_title: I18n.t(stage ? stage[:i18n] : 'toolbar.name'),
            scrollable:   false,
            resizable:    false,
            width:        320,
            height:       260,
            style:        UI::HtmlDialog::STYLE_UTILITY
          }
          UI::HtmlDialog.new(props)
        end

        def build_html(stage_key)
          stage = ToolCatalog.stage(stage_key)
          return '<!DOCTYPE html><html><body>ไม่พบกลุ่มเครื่องมือ</body></html>' unless stage

          tiles = ToolCatalog.tools_for(stage[:key]).map { |tool| tile_html(tool) }.join("\n")
          title = html_escape(I18n.t(stage[:i18n]))

          <<~HTML
            <!DOCTYPE html>
            <html lang="th">
            <head>
            <meta charset="utf-8">
            <style>
              * { box-sizing: border-box; }
              html, body { margin: 0; height: 100%; }
              body {
                font-family: "Segoe UI", "Tahoma", sans-serif;
                background: #f3f5f9; color: #1f2937;
                display: flex; flex-direction: column; gap: 6px; padding: 8px;
              }
              header {
                font-size: 12px; font-weight: 600; color: #1d4ed8;
                padding-bottom: 4px; border-bottom: 1px solid #dbe2ef;
              }
              .grid {
                display: grid; gap: 6px;
                grid-template-columns: repeat(3, 1fr);
                overflow-y: auto; flex: 1;
              }
              .tile {
                display: flex; flex-direction: column; align-items: center; gap: 4px;
                padding: 6px 4px; border: 1px solid #d7deea; border-radius: 8px;
                background: #ffffff; cursor: pointer; font: inherit; color: inherit;
              }
              .tile:hover { border-color: #3b82f6; background: #eef4ff; }
              .tile:active { background: #dbeafe; }
              .tile img { width: 26px; height: 26px; image-rendering: pixelated; }
              .tile span { font-size: 10px; line-height: 1.15; text-align: center; }
            </style>
            </head>
            <body>
              <header>#{title}</header>
              <div class="grid">
            #{tiles}
              </div>
              <script>
                function runTool(code) { sketchup.run_tool(code); }
              </script>
            </body>
            </html>
          HTML
        end

        def tile_html(tool)
          label = html_escape(I18n.t("#{tool[:i18n]}.label"))
          tooltip = html_escape(I18n.t("#{tool[:i18n]}.tooltip"))
          icon = html_escape(icon_data_uri(tool[:icon]))
          <<~TILE
                <button type="button" class="tile" title="#{tooltip}" onclick="runTool('#{tool[:code]}')">
                  <img src="#{icon}" alt="">
                  <span>#{label}</span>
                </button>
          TILE
        end

        def icon_data_uri(icon)
          path = ToolCatalog.icon_path(icon, large: true)
          path = ToolCatalog.icon_path(icon) unless File.exist?(path)
          return '' unless File.exist?(path)

          "data:image/png;base64,#{[File.binread(path)].pack('m0')}"
        rescue StandardError
          ''
        end

        def html_escape(text)
          text.to_s
              .gsub('&', '&amp;')
              .gsub('<', '&lt;')
              .gsub('>', '&gt;')
              .gsub('"', '&quot;')
        end
      end
    end
  end
end
