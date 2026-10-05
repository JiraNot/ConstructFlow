# frozen_string_literal: true

require_relative 'i18n'
require_relative 'html_dialog'
require_relative 'shortcut_manager'
require_relative 'tool_catalog'
require_relative 'stage_palette'

module JiraNot
  module ConstructFlow
    module Core
      # Builds the ConstructFlow toolbar.
      #
      # Native SketchUp toolbars have no flyout/submenu support, so instead of
      # 20 flat buttons the toolbar stays short: one full-editor launcher plus
      # ONE flyout button per workflow stage. Each stage button opens a compact
      # StagePalette listing that stage's tools (see ToolCatalog for the data).
      module Toolbar
        ICON_DIR = ToolCatalog::ICON_DIR

        module_function

        # Installs the launcher toolbar and attaches every domain submenu
        # into the ONE ConstructFlow menu created by Core::UiEntry.
        def install(runtime, main_menu)
          install_toolbar(runtime) if defined?(UI) && defined?(UI::Toolbar)
          return unless defined?(UI) && UI.respond_to?(:menu)

          install_domain_menus(runtime, main_menu)
        end

        def install_toolbar(runtime)
          tb = UI::Toolbar.new(I18n.t('toolbar.name'))

          # Full editor launcher (panel: catalog, BOQ, detailed parameters).
          add_btn(tb, ToolCatalog::PANEL[:icon],
                  I18n.t('tool.panel.label'), I18n.t('tool.panel.tooltip'), I18n.t('tool.panel.status')) do
            ShortcutManager.execute(ToolCatalog::PANEL[:code], runtime, prompt: true)
          end
          tb.add_separator

          # One flyout button per workflow stage keeps the toolbar short while
          # every tool stays one click away. Stage labels use the bare
          # `group.<key>` string; tooltips/status live under the same prefix.
          ToolCatalog::STAGES.each do |stage|
            add_btn(tb, stage[:icon],
                    I18n.t(stage[:i18n]),
                    I18n.t("#{stage[:i18n]}.tooltip"),
                    I18n.t("#{stage[:i18n]}.status")) do
              StagePalette.open(runtime, stage[:key])
            end
          end

          tb.restore
          tb
        end

        def add_btn(toolbar, icon_name, label, tooltip, status, &block)
          cmd = UI::Command.new(label, &block)
          cmd.tooltip = tooltip
          cmd.status_bar_text = status
          small = File.join(ICON_DIR, "#{icon_name}.png")
          large = File.join(ICON_DIR, "#{icon_name}@2x.png")
          cmd.small_icon = small if File.exist?(small)
          cmd.large_icon = large if File.exist?(large)
          toolbar.add_item(cmd)
          cmd
        end

        def install_domain_menus(runtime, main_menu)
          # Quick-access items (panel/inspector/project/levels) live in
          # Core::UiEntry; only the domain workspaces are added here.
          struct_menu = main_menu.add_submenu('🏛 โครงสร้าง')
          struct_menu.add_item("วางเสาคสล. (Column)\tCL") { ShortcutManager.execute('CL', runtime) }
          struct_menu.add_item("วาดคานโครงสร้าง (Beam)\tBM") { ShortcutManager.execute('BM', runtime) }
          struct_menu.add_item("ลากเส้นกริด (Grid)\tGR") { ShortcutManager.execute('GR', runtime) }
          struct_menu.add_item("วางฐานราก (Foundation)\tFD") { ShortcutManager.execute('FD', runtime) }

          arch_menu = main_menu.add_submenu('🧱 สถาปัตยกรรม')
          arch_menu.add_item("วาดผนัง (Wall)\tWA") { ShortcutManager.execute('WA', runtime) }
          arch_menu.add_item("เจาะช่องเปิด (Opening)\tOP") { ShortcutManager.execute('OP', runtime) }
          arch_menu.add_item("ติดตั้งประตู (Door)\tDR") { ShortcutManager.execute('DR', runtime) }
          arch_menu.add_item("ติดตั้งหน้าต่าง (Window)\tWN") { ShortcutManager.execute('WN', runtime) }
          arch_menu.add_item("สร้างแผ่นพื้น (Floor)\tFL") { ShortcutManager.execute('FL', runtime) }
          arch_menu.add_item("สร้างฝ้าเพดาน (Ceiling)\tCE") { ShortcutManager.execute('CE', runtime) }
          arch_menu.add_item('สร้างหลังคา') { StagePalette.open(runtime, 'architecture') }

          mep_menu = main_menu.add_submenu('⚡ ระบบ MEP')
          mep_menu.add_item("เดินท่อร้อยสาย (Conduit)\tCN") { ShortcutManager.execute('CN', runtime) }
          mep_menu.add_item("วาดเส้นท่อระบายน้ำ (Pipe)\tPI") { ShortcutManager.execute('PI', runtime) }
          mep_menu.add_item("วางบ่อพักน้ำทิ้ง (Manhole)\tMH") { ShortcutManager.execute('MH', runtime) }
          mep_menu.add_item('ติดตั้งตู้ไฟฟ้า') { StagePalette.open(runtime, 'mep') }

          int_menu = main_menu.add_submenu('🛋 ภายในและตกแต่ง')
          int_menu.add_item("วางเคาน์เตอร์บิวท์อิน (Cabinet)\tCB") { ShortcutManager.execute('CB', runtime) }
          int_menu.add_item("วางตู้เสื้อผ้า (Wardrobe)\tWR") { ShortcutManager.execute('WR', runtime) }
          int_menu.add_item('ปูผิวพื้น') { StagePalette.open(runtime, 'interior') }

          lib_menu = main_menu.add_submenu('📦 ไลบรารีและ BOQ')
          lib_menu.add_item('วางครุภัณฑ์') { StagePalette.open(runtime, 'costing') }
          lib_menu.add_item('💰 สรุป BOQ') { ShortcutManager.execute('BOQ', runtime) }
        end
      end
    end
  end
end
