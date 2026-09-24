# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module DoorWindow
      # Ready-made door/window type catalog (Thai construction sizes).
      # Each entry is a spec hash for DoorWindowType.new; instancing is
      # idempotent per model via ensure_registered!
      module Catalog
        MODULE_NAME = 'constructflow.door_window'

        CATALOG = [
          # -- ประตูบานเดี่ยว (single swing) --
          { id: 'D-SW1', name: 'ประตูบานเดี่ยว', category: 'door', operation: 'swing',
            width_mm: 900, height_mm: 2000, panel_style: 'solid', leaf: 45 },
          { id: 'D-GL1', name: 'ประตูกระจกบานเดี่ยว', category: 'door', operation: 'swing',
            width_mm: 900, height_mm: 2100, panel_style: 'glazed', leaf: 45 },
          { id: 'D-ST1', name: 'ประตูด้านหน้า/สนามไฟฟ้า', category: 'door', operation: 'swing',
            width_mm: 900, height_mm: 2000, panel_style: 'solid', frame: 'steel', leaf: 50 },
          { id: 'D-SC1', name: 'ประตูห้องน้ำ', category: 'door', operation: 'swing',
            width_mm: 700, height_mm: 2000, panel_style: 'glazed', leaf: 40 },
          { id: 'D-LV1', name: 'ประตูบานเกล็ด', category: 'door', operation: 'louver',
            width_mm: 800, height_mm: 2000, panel_style: 'louvered', leaf: 40 },

          # -- ประตูบานคู่ / บานเปิดออกนอก --
          { id: 'D-FR2', name: 'ประตูบานเปิดคู่', category: 'door', operation: 'swing_double',
            width_mm: 1600, height_mm: 2100, panel_style: 'solid', leaf: 45 },
          { id: 'D-FD2', name: 'ประตูหนีไฟ 2 บาน', category: 'door', operation: 'swing_double',
            width_mm: 1600, height_mm: 2100, panel_style: 'solid', leaf: 45 },
          { id: 'D-FD4', name: 'ประตูหนีไฟ 4 บาน', category: 'door', operation: 'swing_double',
            width_mm: 3200, height_mm: 2100, panel_style: 'solid', leaf: 45 },
          { id: 'D-A52', name: 'ประตูบ้านในพื้ที่ชุมชนอาศัย', category: 'door', operation: 'swing_double_ego',
            width_mm: 1300, height_mm: 2100, panel_style: 'solid', leaf: 45 },
          { id: 'D-BR1', name: 'ประตูดึงสำหรับงานหลังบ้าน', category: 'door', operation: 'pivot',
            width_mm: 1000, height_mm: 2100, panel_style: 'solid', leaf: 50 },
          { id: 'D-RS1', name: 'ประตูม้วน', category: 'door', operation: 'shutter',
            width_mm: 3000, height_mm: 2500, panel_style: 'solid', frame: 'steel', leaf: 20 },

          # -- ประตูบานเลื่อน --
          { id: 'D-SL2', name: 'ประตูบานเลื่อน 2 บาน', category: 'door', operation: 'sliding',
            width_mm: 1800, height_mm: 2100, panel_style: 'glazed', mullion: 45, leaf: 45 },
          { id: 'D-SL3', name: 'ประตูบานเลื่อน 3 บาน', category: 'door', operation: 'sliding',
            width_mm: 2700, height_mm: 2100, panel_style: 'glazed', mullion: 45, leaf: 45,
            roles: %w[fixed slide_right fixed] },
          { id: 'D-SL4', name: 'ประตูบานเลื่อน 4 บาน', category: 'door', operation: 'sliding',
            width_mm: 3600, height_mm: 2100, panel_style: 'glazed', mullion: 45, leaf: 45,
            roles: %w[slide_left fixed fixed slide_right] },
          { id: 'D-PV1', name: 'ประตูบานหมุน Pivot', category: 'door', operation: 'pivot',
            width_mm: 1200, height_mm: 2400, panel_style: 'glazed', leaf: 50 },

          # -- หน้าต่าง --
          { id: 'W-SL2', name: 'หน้าต่างบานเลื่อน 2 บาน', category: 'window', operation: 'sliding',
            width_mm: 1200, height_mm: 1100, panel_style: 'glazed', mullion: 40, leaf: 35 },
          { id: 'W-SL3', name: 'หน้าต่างบานเลื่อน 3 บาน', category: 'window', operation: 'sliding',
            width_mm: 1800, height_mm: 1200, panel_style: 'glazed', mullion: 40, leaf: 35,
            roles: %w[fixed slide_right fixed] },
          { id: 'W-SL4', name: 'หน้าต่างบานเลื่อน 4 บาน', category: 'window', operation: 'sliding',
            width_mm: 2400, height_mm: 1400, panel_style: 'glazed', mullion: 40, leaf: 35,
            roles: %w[slide_left fixed fixed slide_right] },
          { id: 'W-CS2', name: 'หน้าต่างบานพับ 2 บาน', category: 'window', operation: 'casement',
            width_mm: 1200, height_mm: 1200, panel_style: 'glazed', leaf: 35 },
          { id: 'W-CS3', name: 'หน้าต่างบานพับ 3 บาน', category: 'window', operation: 'casement',
            width_mm: 1800, height_mm: 1200, panel_style: 'glazed', leaf: 35,
            roles: %w[swing_left fixed swing_right] },
          { id: 'W-AW1', name: 'หน้าต่างบานพับชั้นบน (Awning)', category: 'window', operation: 'awning',
            width_mm: 1200, height_mm: 600, panel_style: 'glazed', leaf: 35 },
          { id: 'W-HP1', name: 'หน้าต่างบานพับชั้นล่าง (Hopper)', category: 'window', operation: 'hopper',
            width_mm: 1200, height_mm: 600, panel_style: 'glazed', leaf: 35 },
          { id: 'W-PV1', name: 'หน้าต่างบานหมุน Pivot', category: 'window', operation: 'pivot',
            width_mm: 900, height_mm: 1200, panel_style: 'glazed', leaf: 35 },
          { id: 'W-LV1', name: 'หน้าต่างบานเกล็ด', category: 'window', operation: 'louver',
            width_mm: 900, height_mm: 1200, panel_style: 'louvered', leaf: 30 },
          { id: 'W-LV2', name: 'หน้าต่างบานเกล็ดแก้วใหญ่', category: 'window', operation: 'louver',
            width_mm: 1200, height_mm: 1000, panel_style: 'louvered', leaf: 30 },
          { id: 'W-FX1', name: 'หน้าต่างบานตาย', category: 'window', operation: 'fixed',
            width_mm: 1200, height_mm: 1200, panel_style: 'glazed', leaf: 35 },
          { id: 'W-FX2', name: 'หน้าต่างบานตายใหญ่', category: 'window', operation: 'fixed',
            width_mm: 2400, height_mm: 1500, panel_style: 'glazed', leaf: 35 },
          { id: 'W-BR1', name: 'หน้าต่างช่องระบายอากาศ', category: 'window', operation: 'louver',
            width_mm: 600, height_mm: 600, panel_style: 'louvered', leaf: 30 },
          { id: 'W-SH1', name: 'หน้าต่างชัตเตอร์', category: 'window', operation: 'shutter',
            width_mm: 1500, height_mm: 1200, panel_style: 'solid', leaf: 20 },

          # -- Storefront / ผนังกระจกหน้าร้าน --
          { id: 'SF-GL2', name: 'Storefront บานเลื่อน 2 บาน', category: 'door', operation: 'sliding',
            width_mm: 2400, height_mm: 2500, panel_style: 'glazed', depth: 150, mullion: 50, leaf: 50 },
          { id: 'SF-GL4', name: 'Storefront บานเลื่อน 4 บาน', category: 'door', operation: 'sliding',
            width_mm: 3600, height_mm: 2500, panel_style: 'glazed', depth: 150, mullion: 50, leaf: 50,
            roles: %w[slide_left fixed fixed slide_right] },
          { id: 'SF-FX1', name: 'Storefront บานตายใหญ่', category: 'window', operation: 'fixed',
            width_mm: 3000, height_mm: 2500, panel_style: 'glazed', depth: 150, leaf: 35 },
          { id: 'SF-PV1', name: 'Storefront บานหมุนเข้าออก', category: 'door', operation: 'pivot',
            width_mm: 1800, height_mm: 2400, panel_style: 'glazed', depth: 150, leaf: 50 },

          # -- มุ้งลวด --
          { id: 'MS-SW1', name: 'ประตูมุ้งลวดบานเดี่ยว', category: 'door', operation: 'swing',
            width_mm: 900, height_mm: 2000, panel_style: 'glazed', leaf: 30 },
          { id: 'MS-SL2', name: 'หน้าต่างมุ้งลวดบานเลื่อน', category: 'window', operation: 'sliding',
            width_mm: 1200, height_mm: 1100, panel_style: 'glazed', mullion: 35, leaf: 25 }
        ].freeze

        module_function

        def all
          CATALOG
        end

        def size
          CATALOG.size
        end

        def find(catalog_id)
          CATALOG.find { |entry| entry[:id] == catalog_id.to_s }
        end

        # Builds an immutable DoorWindowType from a catalog entry, optionally
        # overriding dimensions (mm) and frame/glass parameters.
        def build_type(catalog_id, width_mm: nil, height_mm: nil,
                       frame_width_mm: nil, frame_depth_mm: nil,
                       glass_thickness_mm: nil, leaf_thickness_mm: nil,
                       mullion_width_mm: nil, louver_spacing_mm: nil,
                       side_allowance_mm: nil, head_allowance_mm: nil)
          entry = find(catalog_id)
          raise ArgumentError, "unknown catalog id: #{catalog_id}" unless entry

          DoorWindowType.new(
            id: entry[:id],
            name: entry[:name],
            category: entry[:category],
            operation: entry[:operation],
            width_mm: width_mm || entry[:width_mm],
            height_mm: height_mm || entry[:height_mm],
            frame_material: entry[:frame] || 'aluminium',
            frame_width_mm: frame_width_mm || default_frame_width(entry),
            panel_roles: entry[:roles],
            panel_style: entry[:panel_style],
            frame_depth_mm: frame_depth_mm || entry[:depth] || 100,
            glass_thickness_mm: glass_thickness_mm || 6,
            leaf_thickness_mm: leaf_thickness_mm || entry[:leaf] || 40,
            mullion_width_mm: mullion_width_mm || entry[:mullion] || 0,
            louver_spacing_mm: louver_spacing_mm || 80,
            side_allowance_mm: side_allowance_mm || 0,
            head_allowance_mm: head_allowance_mm || 0
          )
        end

        # Registers every catalog type missing from the model's registry.
        # Returns the ids that were newly added (idempotent per model).
        def ensure_registered!(registry)
          added = []
          CATALOG.each do |entry|
            next if registry.registered?(entry[:id])

            registry.register(build_type(entry[:id]))
            added << entry[:id]
          end
          added.freeze
        end

        def default_frame_width(entry)
          entry[:frame] == 'steel' ? 60.0 : 45.0
        end
      end
    end
  end
end
