# frozen_string_literal: true
# Real-SketchUp smoke test for the ConstructFlow extension.
#
# Run inside SketchUp 2026 with:
#   Sketchup.exe -RubyStartup "<abs path to this file>"
#
# It loads the working-tree extension (not the installed Plugins copy), runs
# contract checks against the real SketchUp Ruby API, writes a report next to
# the repository and then asks SketchUp to quit.

require 'sketchup.rb'

ROOT_DIR = File.expand_path(File.join(__dir__, '..'))
EXT_ROOT = File.join(ROOT_DIR, 'apps', 'sketchup-extension')
REPORT = File.join(ROOT_DIR, 'sketchup_smoke_report.txt')

def report!(lines)
  File.open(REPORT, 'w:utf-8') { |f| f.puts(lines) }
rescue StandardError => e
  File.write(REPORT, "REPORT WRITE FAILED: #{e.class}: #{e.message}")
end

lines = []
failures = []

def check(failures, lines, label)
  ok = !!yield
  lines << "#{ok ? 'PASS' : 'FAIL'}  #{label}"
  failures << label unless ok
  ok
rescue StandardError => e
  lines << "FAIL  #{label}  (#{e.class}: #{e.message})"
  failures << label
  false
end

begin
  # Load the working tree by absolute path. A stale copy may already be
  # installed in the Plugins folder; require_relative inside our bootstrap
  # keeps every file coming from the working tree.
  bootstrap = File.join(EXT_ROOT, 'constructflow', 'bootstrap.rb')
  lines << "bootstrap: #{bootstrap} (exists=#{File.exist?(bootstrap)})"
  load bootstrap

  Core = JiraNot::ConstructFlow::Core
  lines << "SketchUp #{Sketchup.version} / Ruby #{RUBY_VERSION}"
  lines << "ToolCatalog: #{defined?(Core::ToolCatalog) ? 'loaded' : 'MISSING'}"

  check(failures, lines, 'ToolCatalog exposes 7 stages / 46 tools') do
    Core::ToolCatalog::STAGES.size == 7 && Core::ToolCatalog::TOOLS.size == 46
  end

  check(failures, lines, 'Every catalog icon exists on disk (24px + 48px)') do
    Core::ToolCatalog::TOOLS.all? do |tool|
      File.exist?(Core::ToolCatalog.icon_path(tool[:icon])) &&
        File.exist?(Core::ToolCatalog.icon_path(tool[:icon], large: true))
    end
  end

  check(failures, lines, 'Roof family codes are in the catalog') do
    %w[RF FRM MFR HGR AR].all? { |c| Core::ToolCatalog.tool(c) }
  end

  check(failures, lines, 'Roof family has parameter schemas and opens a dialog') do
    %w[FRM MFR HGR AR].all? do |c|
      Core::ToolProperties.drawing?(c) && !Core::ToolProperties.schema_for(c).empty?
    end
  end

  check(failures, lines, 'Every catalog code is a registered shortcut') do
    Core::ToolCatalog::TOOLS.all? { |t| Core::ShortcutManager::SHORTCUTS.key?(t[:code]) }
  end

  check(failures, lines, 'No catalog code shadows another (typing reachable)') do
    codes = Core::ToolCatalog::TOOLS.map { |t| t[:code] }
    codes.combination(2).none? { |a, b| a.start_with?(b) || b.start_with?(a) }
  end

  check(failures, lines, 'Every stage palette wires its tools with embedded icons') do
    Core::ToolCatalog::STAGES.all? do |stage|
      html = Core::StagePalette.build_html(stage[:key])
      tools = Core::ToolCatalog.tools_for(stage[:key])
      !html.include?('ไม่พบกลุ่มเครื่องมือ') &&
        tools.all? { |t| html.include?("runTool('#{t[:code]}')") } &&
        html.scan('data:image/png;base64,').size >= tools.size
    end
  end

  check(failures, lines, 'RoofFramingTool keeps the settings from the dialog') do
    tool = JiraNot::ConstructFlow::Architecture::Tools::RoofFramingTool.new(
      settings: { pitch_degrees: 35.0, roof_type: 'shed' }
    )
    s = tool.instance_variable_get(:@settings)
    s[:pitch_degrees] == 35.0 && s[:roof_type] == 'shed'
  end

  check(failures, lines, 'ShortcutManager.panel_payload stringifies symbol keys') do
    Core::ShortcutManager.panel_payload({ form: 'hip', slope_deg: 30.0 }) ==
      { 'form' => 'hip', 'slope_deg' => 30.0 }
  end

  # Drawing must never yank the user's working viewport. The managed plan
  # scene keeps its own top camera, but the live camera must stay put.
  def camera_fingerprint(view)
    cam = view.camera
    {
      eye: cam.eye.to_a.map(&:to_f),
      target: cam.target.to_a.map(&:to_f),
      up: cam.up.to_a.map(&:to_f),
      perspective: (cam.respond_to?(:perspective?) ? cam.perspective? : nil),
      height: (cam.respond_to?(:height) ? cam.height.to_f : nil)
    }
  end

  check(failures, lines, 'Plan-scene refresh leaves the user camera untouched') do
    runtime = JiraNot::ConstructFlow::Runtime
    view = Sketchup.active_model.active_view
    before = camera_fingerprint(view)
    runtime.plan_scenes.refresh_preset('architecture.construction')
    after = camera_fingerprint(view)
    unless before == after
      lines << "      camera before=#{before.inspect}"
      lines << "      camera after =#{after.inspect}"
    end
    before == after
  end

  # Real-model API touch: a blank model must accept our tool without erroring.
  check(failures, lines, 'Active model accepts RoofFramingTool selection') do
    model = Sketchup.active_model
    tool = JiraNot::ConstructFlow::Architecture::Tools::RoofFramingTool.new(
      settings: { pitch_degrees: 30.0, roof_type: 'gable' }
    )
    model.select_tool(tool)
    tool.respond_to?(:activate) && tool.respond_to?(:onLButtonDown)
  end

  lines << ''
  lines << "RESULT: #{failures.empty? ? 'ALL PASS' : "FAILURES=#{failures.size}"}"
  failures.each { |f| lines << "  - #{f}" }
rescue Exception => e
  lines << "SMOKE ERROR: #{e.class}: #{e.message}"
  lines << Array(e.backtrace).first(8).join("\n")
end

report!(lines)

# Ask SketchUp to close itself so the run is unattended.
begin
  UI.start_timer(0.5, false) { Sketchup.quit if Sketchup.respond_to?(:quit) }
rescue StandardError
  nil
end
