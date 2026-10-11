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
  drawing_ui = [Core::Toolbar, Core::ToolCatalog, Core::ShortcutManager, Core::ToolProperties,
                Core::StagePalette].select { |constant| Core.const_defined?(constant, false) }
  lines << "drawing UI: #{drawing_ui.empty? ? 'retired' : "STILL LOADED -> #{drawing_ui.join(', ')}"}"

  check(failures, lines, 'Native drawing UI is retired (no toolbar / catalog / shortcuts)') do
    drawing_ui.empty?
  end

  check(failures, lines, 'Retired panel actions answer with a migration message') do
    Core::HtmlDialogManager::RETIRED_ACTIONS.include?('draw_wall') &&
      Core::HtmlDialogManager::RETIRED_ACTIONS.include?('trigger_shortcut') &&
      !Core::HtmlDialogManager::ACTIONS.key?('draw_wall')
  end

  check(failures, lines, 'Adapter handlers stay registered (project, sheets, BOQ, scenes)') do
    %w[get_state create_level set_phase generate_a3_drawing_sheets generate_extension_scenes
       auto_dimension get_boq_data].all? { |a| Core::HtmlDialogManager::ACTIONS.key?(a) }
  end

  check(failures, lines, 'Bridge and LayOut export services are available') do
    defined?(Core::PlanEditorSync) && defined?(Core::NativeLayoutExportService)
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

  # Real-model API touch: the adapter must render a managed plan scene on a
  # blank model without touching the user's live camera.
  check(failures, lines, 'Active model accepts the plan-scene renderer') do
    model = Sketchup.active_model
    runtime = JiraNot::ConstructFlow::Runtime
    runtime.respond_to?(:plan_scenes) && model.respond_to?(:entities) &&
      Core::SketchupPlanRenderer.new.respond_to?(:render)
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
