# frozen_string_literal: true

require_relative '../../../core/ghost_preview'
require_relative '../../../core/units'

module JiraNot
  module ConstructFlow
    module Library
      module Tools
        class AssetTool
          def initialize(runtime:, asset_id: 'chair.office.mesh', size_mm: [600.0, 600.0, 800.0], rotation_deg: 0.0)
            @runtime = runtime
            @asset_id = asset_id.to_s
            @size_mm = size_mm.map { |v| Float(v) }
            @rotation_deg = Float(rotation_deg)
            @input_point = Sketchup::InputPoint.new
          end

          def activate
            Sketchup.set_status_text(
              "ConstructFlow วางครุภัณฑ์: คลิกตำแหน่งเพื่อวาง #{@asset_id} (หมุน #{@rotation_deg.to_i}°) • Esc เพื่อยกเลิก",
              SB_PROMPT
            )
          end

          def onMouseMove(_flags, x, y, view)
            @input_point.pick(view, x, y)
            view.invalidate
          end

          def draw(view)
            @input_point.draw(view) if @input_point.valid?

            if @input_point.valid?
              mesh = Core::GhostPreview.build_asset_mesh(
                @input_point.position,
                @asset_id,
                @size_mm,
                @rotation_deg
              )
              if mesh
                Core::GhostPreview.render_ghost(
                  view,
                  mesh,
                  face_color: [155, 89, 182, 80],
                  line_color: [142, 68, 173]
                )
              end
            end
          end

          def onLButtonDown(_flags, x, y, view)
            @input_point.pick(view, x, y)
            return unless @input_point.valid?

            result = @runtime.commands.execute(
              'PlaceCatalogAsset',
              {
                asset_id: @asset_id,
                location_mm: Core::Units.point_to_mm(@input_point.position),
                rotation_deg: @rotation_deg
              },
              project_id: @runtime.project.project_id
            )

            if result[:status] == 'success'
              @runtime.active_model.select_tool(nil)
            else
              UI.messagebox(result[:errors].join("\n"))
            end
          rescue StandardError => e
            UI.messagebox("ConstructFlow Asset error: #{e.message}")
          end

          def getExtents
            bounds = Geom::BoundingBox.new
            bounds.add(@start_point) if defined?(@start_point) && @start_point
            bounds.add(@input_point.position) if @input_point&.valid?
            bounds
          end

          def deactivate(view)
            @start_point = nil if defined?(@start_point)
            view.invalidate if view
          end

          def onCancel(_reason, _view)
            @runtime.active_model.select_tool(nil)
          end
        end
      end
    end
  end
end
