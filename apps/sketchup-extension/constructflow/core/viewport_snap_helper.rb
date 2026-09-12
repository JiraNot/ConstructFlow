# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module ViewportSnapHelper
        module_function

        def draw_snap_glyph(view, point, snap_info, label_suffix: '')
          return unless view && point && snap_info

          kind = (snap_info[:kind] || snap_info['kind']).to_s

          case kind
          when 'endpoint'
            view.draw_points([point], 10, 1, 'green') if view.respond_to?(:draw_points)
            draw_halo_text(view, point, " 🟩 [Endpoint]#{label_suffix}", color: 'lime')
          when 'midpoint'
            view.draw_points([point], 12, 6, 'cyan') if view.respond_to?(:draw_points)
            draw_halo_text(view, point, " 🔺 [Midpoint]#{label_suffix}", color: 'cyan')
          when 'intersection'
            view.draw_points([point], 12, 4, 'orange') if view.respond_to?(:draw_points)
            draw_halo_text(view, point, " ✖️ [Intersection]#{label_suffix}", color: 'orange')
          when 'close_loop'
            view.draw_points([point], 14, 2, 'gold') if view.respond_to?(:draw_points)
            draw_halo_text(view, point, " 🔒 [Close Loop]#{label_suffix}", color: 'gold')
          end
        end

        def draw_halo_text(view, point, text, color: 'white')
          return unless view.respond_to?(:draw_text)

          screen = view.respond_to?(:screen_coords) ? view.screen_coords(point) : point
          [-1, 1].each do |ox|
            [-1, 1].each do |oy|
              halo_pt = Geom::Point3d.new(screen.x + ox, screen.y + oy, 0)
              view.draw_text(halo_pt, text, color: 'black') rescue nil
            end
          end
          view.draw_text(screen, text, color: color) rescue nil
        end
      end
    end
  end
end
