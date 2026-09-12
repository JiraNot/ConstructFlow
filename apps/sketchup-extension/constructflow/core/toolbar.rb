# frozen_string_literal: true

require_relative 'i18n'
require_relative 'html_dialog'
require_relative 'ghost_preview'
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

        def install(runtime)
          install_toolbar(runtime) if defined?(UI) && defined?(UI::Toolbar)
          install_menus(runtime)   if defined?(UI) && UI.respond_to?(:menu)
        end

        def install_toolbar(runtime)
          tb = UI::Toolbar.new(I18n.t('toolbar.name'))

          # Single entry-point button — opens the modern floating panel
          cmd = UI::Command.new('ConstructFlow') { HtmlDialogManager.open_panel(runtime) }
          cmd.tooltip     = 'เปิด/ปิดแผงควบคุม ConstructFlow'
          cmd.status_bar_text = 'เปิดแผงควบคุม ConstructFlow BIM'

          # Try to use the inspector icon as the panel-launch button
          small = File.join(ICON_DIR, 'inspector.png')
          large = File.join(ICON_DIR, 'inspector@2x.png')
          cmd.small_icon = small if File.exist?(small)
          cmd.large_icon = large if File.exist?(large)

          tb.add_item(cmd)
          tb.restore
          tb
        end

        def install_menus(runtime)
          main_menu = UI.menu('Extensions').add_submenu(I18n.t('menu.main'))

          main_menu.add_item('🏗 เปิดแผง ConstructFlow') { HtmlDialogManager.open_panel(runtime) }
          main_menu.add_separator

          # Keep quick-access menu items for power users
          setup_menu = main_menu.add_submenu('⚙️ ตั้งค่าโครงการ')
          setup_menu.add_item('Inspector สถานะโครงการ') { runtime.show_inspector }
          setup_menu.add_item('กำหนดระดับชั้น (Level)')  { HtmlDialogManager.open_panel(runtime) }
          setup_menu.add_item('กำหนดเฟส (Phase)')        { HtmlDialogManager.open_panel(runtime) }

          struct_menu = main_menu.add_submenu('🏛 โครงสร้าง')
          struct_menu.add_item('วางฐานราก')  { HtmlDialogManager.open_panel(runtime) }
          struct_menu.add_item('วางเสาคสล.') { HtmlDialogManager.open_panel(runtime) }

          arch_menu = main_menu.add_submenu('🧱 สถาปัตยกรรม')
          arch_menu.add_item('วาดผนัง')             { HtmlDialogManager.open_panel(runtime) }
          arch_menu.add_item('เจาะช่องเปิด')         { HtmlDialogManager.open_panel(runtime) }
          arch_menu.add_item('ติดตั้งประตู/หน้าต่าง') { HtmlDialogManager.open_panel(runtime) }
          arch_menu.add_item('สร้างหลังคา')           { HtmlDialogManager.open_panel(runtime) }

          mep_menu = main_menu.add_submenu('⚡ ระบบ MEP')
          mep_menu.add_item('วางบ่อพักน้ำทิ้ง') { HtmlDialogManager.open_panel(runtime) }
          mep_menu.add_item('วาดเส้นท่อ')         { HtmlDialogManager.open_panel(runtime) }
          mep_menu.add_item('ติดตั้งตู้ไฟฟ้า')   { HtmlDialogManager.open_panel(runtime) }
          mep_menu.add_item('เดินท่อร้อยสาย')     { HtmlDialogManager.open_panel(runtime) }

          int_menu = main_menu.add_submenu('🛋 ภายในและตกแต่ง')
          int_menu.add_item('ปูผิวพื้น')           { HtmlDialogManager.open_panel(runtime) }
          int_menu.add_item('วางเคาน์เตอร์บิวท์อิน') { HtmlDialogManager.open_panel(runtime) }
          int_menu.add_item('วางตู้เสื้อผ้า')      { HtmlDialogManager.open_panel(runtime) }

          lib_menu = main_menu.add_submenu('📦 ไลบรารีและ BOQ')
          lib_menu.add_item('วางครุภัณฑ์')   { HtmlDialogManager.open_panel(runtime) }
          lib_menu.add_item('💰 สรุป BOQ') { HtmlDialogManager.open_panel(runtime) }
        end
      end
    end
  end
end
