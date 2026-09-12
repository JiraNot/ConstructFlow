# frozen_string_literal: true

require_relative 'drawing_sheet_spec'

module JiraNot
  module ConstructFlow
    module Core
      class DrawingIntentRegistry
        DEFAULT_DISCIPLINES = {
          'architecture' => [
            { number: 'A-101', title: 'Floor Plan - Level 1', preset_id: 'architecture.floor_plan', scale: '1:100', paper_size: 'A3', per_level: true },
            { number: 'A-201', title: 'Building Elevations', preset_id: 'architecture.elevation', scale: '1:100', paper_size: 'A3', per_level: false },
            { number: 'A-301', title: 'Building Sections', preset_id: 'architecture.section', scale: '1:100', paper_size: 'A3', per_level: false },
            { number: 'A-601', title: 'Door & Window Schedule', preset_id: 'architecture.schedule', scale: '1:50', paper_size: 'A3', per_level: false }
          ],
          'structure' => [
            { number: 'S-101', title: 'Foundation & Column Layout', preset_id: 'structure.foundation_plan', scale: '1:100', paper_size: 'A3', per_level: false },
            { number: 'S-102', title: 'Framing Plan - Level 1', preset_id: 'structure.framing_plan', scale: '1:100', paper_size: 'A3', per_level: true }
          ],
          'drainage' => [
            { number: 'P-101', title: 'Drainage & Sanitary Layout', preset_id: 'drainage.site_plan', scale: '1:100', paper_size: 'A3', per_level: false }
          ],
          'electrical' => [
            { number: 'E-101', title: 'Lighting Layout Plan', preset_id: 'electrical.lighting_plan', scale: '1:100', paper_size: 'A3', per_level: true },
            { number: 'E-102', title: 'Power & Receptacle Plan', preset_id: 'electrical.power_plan', scale: '1:100', paper_size: 'A3', per_level: true }
          ],
          'interior' => [
            { number: 'IN-101', title: 'Interior Layout Plan', preset_id: 'interior.layout_plan', scale: '1:50', paper_size: 'A3', per_level: true },
            { number: 'IN-501', title: 'Joinery Shop Drawings', preset_id: 'interior.shop_drawing', scale: '1:20', paper_size: 'A3', per_level: false }
          ],
          'surface' => [
            { number: 'L-101', title: 'Hardscape & Paving Plan', preset_id: 'surface.paving_plan', scale: '1:100', paper_size: 'A3', per_level: false }
          ]
        }.freeze

        def initialize(custom_intents = {})
          @intents = normalize_intents(custom_intents)
        end

        def register_intent(discipline:, number:, title:, preset_id:, scale: '1:100', paper_size: 'A3', per_level: false)
          disc = discipline.to_s.strip.downcase
          @intents[disc] ||= []
          @intents[disc] << {
            number: number.to_s.strip,
            title: title.to_s.strip,
            preset_id: preset_id.to_s.strip,
            scale: scale.to_s.strip,
            paper_size: paper_size.to_s.strip.upcase,
            per_level: !!per_level
          }
        end

        def plan_package(package_scopes:, levels: [], revision: 'P01', issue_status: 'working')
          scopes = Array(package_scopes).map { |s| s.to_s.strip.downcase }
          matched_sheets = []

          scopes.each do |disc|
            disc_intents = @intents[disc] || DEFAULT_DISCIPLINES[disc] || []
            disc_intents.each do |intent|
              if intent[:per_level] && !levels.empty?
                levels.each_with_index do |lvl, idx|
                  lvl_name = lvl.is_a?(Hash) ? (lvl['name'] || lvl[:name]) : lvl.to_s
                  lvl_id = lvl.is_a?(Hash) ? (lvl['id'] || lvl[:id]) : lvl.to_s
                  sheet_num = generate_level_sheet_number(intent[:number], idx + 1)
                  sheet_title = "#{intent[:title].sub(/Level 1/, lvl_name)} (#{lvl_name})"

                  viewport = build_default_viewport(intent, scene_suffix: lvl_id)
                  matched_sheets << DrawingSheetSpec.new(
                    id: "sheet_#{sheet_num.downcase.tr('-', '_')}",
                    number: sheet_num,
                    title: sheet_title,
                    paper_size: intent[:paper_size] || 'A3',
                    orientation: 'landscape',
                    revision: revision,
                    issue_status: issue_status,
                    viewports: [viewport]
                  )
                end
              else
                viewport = build_default_viewport(intent)
                matched_sheets << DrawingSheetSpec.new(
                  id: "sheet_#{intent[:number].downcase.tr('-', '_')}",
                  number: intent[:number],
                  title: intent[:title],
                  paper_size: intent[:paper_size] || 'A3',
                  orientation: 'landscape',
                  revision: revision,
                  issue_status: issue_status,
                  viewports: [viewport]
                )
              end
            end
          end

          matched_sheets
        end

        private

        def normalize_intents(custom)
          res = {}
          DEFAULT_DISCIPLINES.each { |k, v| res[k] = v.dup }
          (custom || {}).each do |k, v|
            res[k.to_s.strip.downcase] = Array(v).dup
          end
          res
        end

        def generate_level_sheet_number(base_number, level_index)
          # A-101 -> A-101, A-102 etc.
          parts = base_number.split('-')
          return base_number if parts.length < 2

          prefix = parts[0]
          num = parts[1].to_i
          format('%s-%03d', prefix, num + level_index - 1)
        end

        def build_default_viewport(intent, scene_suffix: nil)
          scene = scene_suffix ? "#{intent[:preset_id]}_#{scene_suffix}" : intent[:preset_id]
          DrawingViewportSpec.new(
            id: "vp_#{intent[:number].downcase.tr('-', '_')}",
            scene_name: scene,
            preset_id: intent[:preset_id],
            scale: intent[:scale] || '1:100',
            bounds_mm: [20.0, 20.0, 360.0, 250.0],
            render_mode: 'vector',
            lineweight_profile: 'construction'
          )
        end
      end
    end
  end
end
