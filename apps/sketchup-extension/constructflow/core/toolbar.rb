# frozen_string_literal: true

require_relative 'i18n'
require_relative 'html_dialog'
require_relative 'ghost_preview'
require_relative 'shortcut_manager'
require_relative '../modules/structure/tools/foundation_tool'
require_relative '../modules/door_window/tools/door_window_tool'
require_relative '../modules/interior/tools/wardrobe_tool'
require_relative '../modules/library/tools/asset_tool'
require_relative '../modules/drainage/tools/pipe_tool'
require_relative '../modules/electrical/tools/conduit_tool'

module JiraNot
  module ConstructFlow
    module Core
      module Toolbar
        ICON_DIR = File.expand_path(File.join(__dir__, '..', 'icons')).freeze

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

          # Single entry-point button — opens the modern floating panel
          cmd = UI::Command.new('ConstructFlow') { HtmlDialogManager.open_panel(runtime) }
          cmd.tooltip     = 'เปิด/ปิดแผงควบคุม ConstructFlow (CF)'
          cmd.status_bar_text = 'เปิดแผงควบคุม ConstructFlow BIM [คีย์ลัด: CF]'

          # Try to use the inspector icon as the panel-launch button
          small = File.join(ICON_DIR, 'inspector.png')
          large = File.join(ICON_DIR, 'inspector@2x.png')
          cmd.small_icon = small if File.exist?(small)
          cmd.large_icon = large if File.exist?(large)

          tb.add_item(cmd)
          tb.restore
          tb
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
          arch_menu.add_item('สร้างหลังคา') { HtmlDialogManager.open_panel(runtime) }

          mep_menu = main_menu.add_submenu('⚡ ระบบ MEP')
          mep_menu.add_item("เดินท่อร้อยสาย (Conduit)\tCN") { ShortcutManager.execute('CN', runtime) }
          mep_menu.add_item("วาดเส้นท่อระบายน้ำ (Pipe)\tPI") { ShortcutManager.execute('PI', runtime) }
          mep_menu.add_item("วางบ่อพักน้ำทิ้ง (Manhole)\tMH") { ShortcutManager.execute('MH', runtime) }
          mep_menu.add_item('ติดตั้งตู้ไฟฟ้า') { HtmlDialogManager.open_panel(runtime) }

          int_menu = main_menu.add_submenu('🛋 ภายในและตกแต่ง')
          int_menu.add_item("วางเคาน์เตอร์บิวท์อิน (Cabinet)\tCB") { ShortcutManager.execute('CB', runtime) }
          int_menu.add_item("วางตู้เสื้อผ้า (Wardrobe)\tWR") { ShortcutManager.execute('WR', runtime) }
          int_menu.add_item('ปูผิวพื้น') { HtmlDialogManager.open_panel(runtime) }

          lib_menu = main_menu.add_submenu('📦 ไลบรารีและ BOQ')
          lib_menu.add_item('วางครุภัณฑ์') { HtmlDialogManager.open_panel(runtime) }
          lib_menu.add_item('💰 สรุป BOQ')  { HtmlDialogManager.open_panel(runtime) }
        end
      end
    end
  end
end
