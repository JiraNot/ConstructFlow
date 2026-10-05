# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      # Single source of truth for what appears on the toolbar and inside each
      # stage palette: shortcut code, workflow stage, icon and i18n label.
      #
      # The toolbar renders ONE flyout button per stage (see Toolbar), and each
      # flyout shows the stage's tools from here (see StagePalette).
      module ToolCatalog
        ICON_DIR = File.expand_path(File.join(__dir__, '..', 'icons')).freeze

        # One entry per workflow stage, in construction order.
        STAGES = [
          { key: 'setup',        icon: 'inspector', i18n: 'group.setup' },
          { key: 'structure',    icon: 'column',    i18n: 'group.structure' },
          { key: 'architecture', icon: 'wall',      i18n: 'group.architecture' },
          { key: 'mep',          icon: 'pipe',      i18n: 'group.mep' },
          { key: 'interior',     icon: 'cabinet',   i18n: 'group.interior' },
          { key: 'costing',      icon: 'costing',   i18n: 'group.costing' },
          { key: 'drawing',      icon: 'dimension', i18n: 'group.drawing' }
        ].freeze

        # Every addressable tool, in workflow order. `code` matches the
        # ShortcutManager shortcut that performs the action.
        TOOLS = [
          { code: 'IN',  stage: 'setup',        icon: 'inspector',   i18n: 'tool.inspector' },
          { code: 'LV',  stage: 'setup',        icon: 'level',       i18n: 'tool.level' },
          { code: 'PH',  stage: 'setup',        icon: 'phase',       i18n: 'tool.phase' },
          { code: 'FD',  stage: 'structure',    icon: 'foundation',  i18n: 'tool.foundation' },
          { code: 'CL',  stage: 'structure',    icon: 'column',      i18n: 'tool.column' },
          { code: 'GF',  stage: 'structure',    icon: 'grid_framing', i18n: 'tool.grid_framing' },
          { code: 'BM',  stage: 'structure',    icon: 'beam',        i18n: 'tool.beam' },
          { code: 'GR',  stage: 'structure',    icon: 'grid',        i18n: 'tool.grid' },
          { code: 'RB',  stage: 'structure',    icon: 'rebar',       i18n: 'tool.rebar' },
          { code: 'BBS', stage: 'structure',    icon: 'bbs',         i18n: 'tool.bbs' },
          { code: 'WA',  stage: 'architecture', icon: 'wall',        i18n: 'tool.wall' },
          { code: 'OP',  stage: 'architecture', icon: 'opening',     i18n: 'tool.opening' },
          { code: 'DR',  stage: 'architecture', icon: 'door_window', i18n: 'tool.door_window' },
          { code: 'FL',  stage: 'architecture', icon: 'floor',       i18n: 'tool.floor' },
          { code: 'CE',  stage: 'architecture', icon: 'ceiling',     i18n: 'tool.ceiling' },
          { code: 'ST',  stage: 'architecture', icon: 'stair',       i18n: 'tool.stair' },
          { code: 'CW',  stage: 'architecture', icon: 'curtain_wall',      i18n: 'tool.curtain_wall' },
          { code: 'MCW', stage: 'architecture', icon: 'curtain_wall_edit', i18n: 'tool.curtain_wall_edit' },
          { code: 'RF',  stage: 'architecture', icon: 'roof',        i18n: 'tool.roof' },
          { code: 'GT',  stage: 'architecture', icon: 'gutter',      i18n: 'tool.gutter' },
          { code: 'FRM', stage: 'architecture', icon: 'roof_framing',      i18n: 'tool.roof_framing' },
          { code: 'MFR', stage: 'architecture', icon: 'roof_framing_edit', i18n: 'tool.roof_framing_edit' },
          { code: 'HGR', stage: 'architecture', icon: 'roof_hip_gable',    i18n: 'tool.roof_hip_gable' },
          { code: 'AR',  stage: 'architecture', icon: 'roof_auto',         i18n: 'tool.roof_auto' },
          { code: 'RM',  stage: 'architecture', icon: 'room',        i18n: 'tool.room' },
          { code: 'PV',  stage: 'architecture', icon: 'paving',      i18n: 'tool.paving' },
          { code: 'NP',  stage: 'architecture', icon: 'profile_new', i18n: 'tool.profile_new' },
          { code: 'PF',  stage: 'architecture', icon: 'profile_sweep',           i18n: 'tool.profile_sweep' },
          { code: 'PS',  stage: 'architecture', icon: 'profile_sweep_selection', i18n: 'tool.profile_sweep_selection' },
          { code: 'MH',  stage: 'mep',          icon: 'manhole',     i18n: 'tool.manhole' },
          { code: 'PI',  stage: 'mep',          icon: 'pipe',        i18n: 'tool.pipe' },
          { code: 'PB',  stage: 'mep',          icon: 'panelboard',  i18n: 'tool.panelboard' },
          { code: 'CN',  stage: 'mep',          icon: 'cable',       i18n: 'tool.cable' },
          { code: 'SF',  stage: 'interior',     icon: 'surface',     i18n: 'tool.surface' },
          { code: 'CB',  stage: 'interior',     icon: 'cabinet',     i18n: 'tool.cabinet' },
          { code: 'WR',  stage: 'interior',     icon: 'wardrobe',    i18n: 'tool.wardrobe' },
          { code: 'AS',  stage: 'costing',      icon: 'asset',       i18n: 'tool.asset' },
          { code: 'BOQ', stage: 'costing',      icon: 'costing',     i18n: 'tool.costing' },
          { code: 'CSV', stage: 'costing',      icon: 'export_csv',  i18n: 'tool.export_csv' },
          { code: 'DIM', stage: 'drawing',      icon: 'dimension',   i18n: 'tool.dimension' },
          { code: 'EL',  stage: 'drawing',      icon: 'spot_elevation', i18n: 'tool.spot_elevation' },
          { code: 'SCN', stage: 'drawing',      icon: 'scenes',      i18n: 'tool.scenes' },
          { code: 'SS',  stage: 'drawing',      icon: 'smart_stretch', i18n: 'tool.smart_stretch' },
          { code: 'SA',  stage: 'drawing',      icon: 'stretch_area',  i18n: 'tool.stretch_area' },
          { code: 'LS',  stage: 'drawing',      icon: 'laser_level',   i18n: 'tool.laser_level' },
          { code: 'AF',  stage: 'drawing',      icon: 'array_face',    i18n: 'tool.array_face' }
        ].freeze

        # The full editor launcher, kept as its own toolbar button.
        PANEL = { icon: 'panel', i18n: 'tool.panel', code: 'CF' }.freeze

        module_function

        def tools_for(stage_key)
          stage_key = stage_key.to_s
          TOOLS.select { |tool| tool[:stage] == stage_key }
        end

        def tool(code)
          code = code.to_s.upcase
          TOOLS.find { |tool| tool[:code] == code }
        end

        def stage(stage_key)
          stage_key = stage_key.to_s
          STAGES.find { |entry| entry[:key] == stage_key }
        end

        def icon_path(icon, large: false)
          File.join(ICON_DIR, "#{icon}#{large ? '@2x' : ''}.png")
        end
      end
    end
  end
end
