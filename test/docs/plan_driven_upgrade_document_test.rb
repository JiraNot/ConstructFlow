# frozen_string_literal: true

require 'minitest/autorun'

class PlanDrivenUpgradeDocumentTest < Minitest::Test
  ROOT = File.expand_path('../..', __dir__)

  def setup
    @plan = File.read(File.join(ROOT, 'docs', 'PLAN-DRIVEN-MODELING-UPGRADE.md'))
    @roadmap = File.read(File.join(ROOT, 'docs', 'ROADMAP.md'))
    @readme = File.read(File.join(ROOT, 'README.md'))
    @entrypoint = File.read(File.join(ROOT, 'docs', 'IMPLEMENTATION-ENTRYPOINT.md'))
  end

  def test_master_plan_keeps_the_declared_upgrade_tracks_and_north_star
    required_sections = [
      'Plan Interaction Engine', 'Smart Wall 2.0', 'Hosted Door / Window / Opening 2.0',
      'Floor, Ceiling and Room Core', 'Parametric Object Engine', 'Constraint & Dependency Engine',
      'Roof 2.0', 'Structure 2.0', 'Schedule as Model Editor', 'Documentation 2.0',
      'Renovation / Existing / Demolition Superpower', 'Extension Generator 2.0',
      'MEP Residential Core', 'Surface / Paving / Landscape', 'Interior / Joinery',
      'Quantity / Cost / BOQ 2.0', 'QA / Coordination', 'AI Copilot'
    ]
    required_sections.each { |section| assert_includes @plan, section }
    assert_includes @plan, '## 25. North-star acceptance scenario'
    assert_includes @plan, 'Evidence boundary: application tests and native-tool contracts'
    assert_includes @plan, 'real save/close/reopen persistence'
    assert_includes @plan, 'hosted opening/door-window, structural, and surface/paving plan tools'
    assert_includes @plan, "- smart wall\n- door\n- window"
    assert_includes @plan, 'Draw Walls in Plan'
    assert_includes @plan, 'Generate BOQ'
    assert_includes @plan, 'Publish Sheets'
    north_star_steps = %w[
      Create\ Project Create\ Level Draw\ Walls\ in\ Plan Place\ Doors/Windows Detect/Create\ Rooms
      Create\ Floors/Ceilings Add\ Columns/Beams Create\ Roof Add\ Fixtures Route\ Drainage
      Generate\ Sections/Elevations Generate\ Schedules Generate\ BOQ Publish\ Sheets
    ].map(&:to_s)
    scenario = @plan.split('## 25. North-star acceptance scenario', 2).last
    positions = north_star_steps.map { |step| scenario.index(step) }
    assert positions.all?, "missing North-star step: #{north_star_steps.zip(positions).inspect}"
    assert_equal positions.sort, positions
    assert_includes @plan, 'Then modify a major wall dimension by `+500 mm`.'
    assert_includes @roadmap, 'No previously accepted major product domain is removed by this resequencing.'
    %w[Extension Drainage Paving Landscape Joinery BOQ QA AI].each { |domain| assert_includes @roadmap, domain }
  end

  def test_roadmap_is_plan_driven_without_removing_existing_scope
    ordered_releases = [
      'R0 — Native Reliability',
      'R1 — Plan Editor + Smart Wall 2.0',
      'R2 — Hosted Architecture',
      'R3 — Parametric Object + Constraint / Dependency Foundation',
      'R4 — Roof 2.0 + Structure Primitives',
      'R5 — Model-Driven Documentation',
      'R6 — Renovation + Extension Workflow 2.0',
      'R7 — Residential MEP Coordination',
      'R8 — Surface / Landscape / Joinery on the Common Editing Engine',
      'R9 — Quantity / Cost / QA / Publication',
      'R10 — AI Copilot'
    ]
    positions = ordered_releases.map { |release| @roadmap.index(release) }
    assert positions.all?, "missing roadmap release: #{ordered_releases.zip(positions).inspect}"
    assert_equal positions.sort, positions
    assert_includes @roadmap, 'full ConstructFlow product scope'
    assert_includes @roadmap, 'Draw → Select → Move → Stretch → Host → Join → Align → Type → Instance → Schedule → Document'
    %w[Extension Drainage Paving Landscape Joinery BOQ].each { |domain| assert_includes @roadmap, domain }
  end

  def test_readme_points_to_the_same_plan_driven_priority
    assert_includes @readme, 'R0 Native Reliability → R1 Plan Editor + Smart Wall 2.0'
    assert_includes @readme, 'Draw → Select → Move → Stretch → Host → Join → Align → Type → Instance → Schedule → Document'
    %w[Extension Drainage Paving Landscape Joinery BOQ QA AI].each { |domain| assert_includes @readme, domain }
    assert_includes @readme, 'docs/PLAN-DRIVEN-MODELING-UPGRADE.md'
  end

  def test_implementation_entrypoint_points_to_the_active_r0_r1_flow
    assert_includes @entrypoint, 'R0 Native Reliability → R1 Plan Editor + Smart Wall 2.0'
    assert_includes @entrypoint, 'Draw → Select → Move → Stretch → Host → Join → Align → Type → Instance → Schedule → Document'
    assert_includes @entrypoint, '`+500 mm`'
  end
end
