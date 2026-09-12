# frozen_string_literal: true

require_relative '../test_helper'

class QaWorkflowTest < Minitest::Test
  QA = JiraNot::ConstructFlow::Core::QA

  def test_validator_registry_aggregates_issues_and_severity
    registry = QA::ValidatorRegistry.new

    # Register domain validators
    registry.register('architecture') do |_ctx|
      [
        QA::ValidationIssue.new(
          id: 'arch_01',
          domain: 'architecture',
          code: 'unsupported_wall_span',
          message: 'Wall span exceeds 6.0m without structural column',
          severity: :error,
          object_id: 'wall_101'
        ),
        QA::ValidationIssue.new(
          id: 'arch_02',
          domain: 'architecture',
          code: 'low_headroom',
          message: 'Headroom below 2.4m under beam',
          severity: :warning,
          object_id: 'beam_201'
        )
      ]
    end

    registry.register('drainage') do |_ctx|
      [
        {
          code: 'negative_slope',
          message: 'Pipe slope is reverse (-0.5%)',
          severity: :error,
          object_id: 'pipe_01'
        }
      ]
    end

    # Test single domain validation
    arch_issues = registry.validate_domain('architecture')
    assert_equal 2, arch_issues.length
    assert arch_issues.first.blocking?
    refute arch_issues.last.blocking?

    # Test all issues
    all = registry.all_issues
    assert_equal 3, all.length

    # Test blocking errors
    blocking = registry.blocking_errors
    assert_equal 2, blocking.length
    assert_equal %w[arch_01 drainage_1], blocking.map(&:id)

    # Summary
    sum = registry.summary
    assert_equal 3, sum[:total_issues]
    assert_equal 2, sum[:errors]
    assert_equal 1, sum[:warnings]
    assert_equal 0, sum[:infos]
    refute sum[:clean]
  end

  def test_revision_tracker_detects_delta_and_generates_clouds
    tracker = QA::RevisionTracker.new

    rev_p01_objects = {
      'wall_1' => { type: 'architecture.wall', thickness_mm: 100.0, bounds_mm: [0, 0, 5000, 2800] },
      'wall_2' => { type: 'architecture.wall', thickness_mm: 150.0, bounds_mm: [5000, 0, 5000, 4000] },
      'door_1' => { type: 'door_window.instance', width_mm: 800.0 }
    }

    # In Rev P02: wall_1 modified (thickness changed), door_1 removed, door_2 added
    rev_p02_objects = {
      'wall_1' => { type: 'architecture.wall', thickness_mm: 150.0, bounds_mm: [0, 0, 5000, 2800] },
      'wall_2' => { type: 'architecture.wall', thickness_mm: 150.0, bounds_mm: [5000, 0, 5000, 4000] },
      'door_2' => { type: 'door_window.instance', width_mm: 900.0, location_mm: [2000, 0, 0] }
    }

    report = tracker.compare(
      from_objects: rev_p01_objects,
      to_objects: rev_p02_objects,
      from_revision: 'P01',
      to_revision: 'P02',
      author: 'Architect Somchai',
      description: 'Updated wall thickness and swapped door size'
    )

    assert report.changed?
    assert_equal 3, report.change_count
    assert_equal 1, report.added.length
    assert_equal 'door_2', report.added.first[:id]
    assert_equal 1, report.removed.length
    assert_equal 'door_1', report.removed.first[:id]
    assert_equal 1, report.modified.length
    assert_equal 'wall_1', report.modified.first[:id]
    assert_equal({ thickness_mm: { from: 100.0, to: 150.0 } }, report.modified.first[:changes])

    # Revision clouds for modified/added objects with geometry
    refute_empty report.clouds
    cloud_wall = report.clouds.find { |c| c[:object_id] == 'wall_1' }
    assert cloud_wall
    assert_equal 'Δ P02', cloud_wall[:tag]
  end

  def test_site_verification_lifecycle_transitions_and_history
    site = QA::SiteVerificationDefinition.new(object_id: 'col_c1')
    assert_equal 'assumed', site.current_state
    refute site.hold_point?
    refute site.confirmed?

    # Transition 1: mark as hold point before concrete pour
    hold = site.transition_to('verify_on_site', user: 'qc_inspector', notes: 'Check rebar cover before pour')
    assert_equal 'verify_on_site', hold.current_state
    assert hold.hold_point?
    refute hold.confirmed?
    assert_equal 1, hold.history.length

    # Transition 2: survey / field check passed
    surveyed = hold.transition_to('surveyed', user: 'surveyor', notes: 'Rebar cover verified 40mm')
    assert_equal 'surveyed', surveyed.current_state
    refute surveyed.hold_point?
    assert surveyed.confirmed?
    assert_equal 2, surveyed.history.length

    # Transition 3: as-built acceptance
    as_built = surveyed.transition_to('as_built', user: 'project_engineer', notes: 'Casting complete and accepted')
    assert_equal 'as_built', as_built.current_state
    assert as_built.confirmed?
    assert_equal 3, as_built.history.length

    # Invalid transition: cannot jump from assumed directly to as_built
    fresh = QA::SiteVerificationDefinition.new(object_id: 'col_fresh')
    assert_raises(ArgumentError) do
      fresh.transition_to('as_built')
    end

    # Round trip serialization
    hash = as_built.to_h
    restored = QA::SiteVerificationDefinition.from_h(hash)
    assert_equal as_built.object_id, restored.object_id
    assert_equal as_built.current_state, restored.current_state
    assert_equal 3, restored.history.length
  end

  def test_stale_audit_service_propagates_dirty_flags_to_sheets_and_boq
    service = QA::StaleAuditService.new

    smart_objects = [
      {
        id: 'wall_101',
        type: 'architecture.wall',
        dirty_drawing: true,
        dirty_quantity: true
      },
      {
        id: 'col_201',
        type: 'structure.column',
        dirty_drawing: false,
        dirty_quantity: true
      },
      {
        id: 'sink_301',
        type: 'drainage.pipe',
        dirty_drawing: true,
        dirty_quantity: false
      }
    ]

    result = service.audit(smart_objects)

    refute result.up_to_date?
    assert_equal 3, result.dirty_objects.length

    # Stale drawings: wall affects A-101, A-201, A-301; drainage pipe affects P-101
    assert_includes result.stale_drawings, 'A-101'
    assert_includes result.stale_drawings, 'A-201'
    assert_includes result.stale_drawings, 'A-301'
    assert_includes result.stale_drawings, 'P-101'

    # Stale quantities: architecture, structure
    assert_includes result.stale_quantities, 'architecture'
    assert_includes result.stale_quantities, 'structure'

    # Stale estimates (BOQ) must be true since quantities are dirty
    assert result.stale_estimates

    # Clean case
    clean_result = service.audit([
      { id: 'ok_1', type: 'architecture.wall', dirty_drawing: false, dirty_quantity: false }
    ])
    assert clean_result.up_to_date?
    assert_empty clean_result.dirty_objects
    assert_empty clean_result.stale_drawings
    assert_empty clean_result.stale_quantities
    refute clean_result.stale_estimates
  end
end
