# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      class ExecutionRunner
        SUCCESS_STATUSES = %w[success skipped].freeze
        FAILURE_STATUSES = %w[failed rejected].freeze

        def initialize(command_bus:, command_resolver: nil)
          @command_bus = command_bus
          @command_resolver = command_resolver || method(:default_command_for)
        end

        def execute(plan, dry_run: false, actor: { kind: 'automation' }, project_id: nil)
          steps = Array(plan.fetch('steps'))
          states = {}
          results = steps.map do |step|
            domain = step.fetch('domain').to_s
            dependencies = Array(step['dependencies']).map(&:to_s)
            blocked = !dry_run && dependencies.any? { |dependency| states[dependency] != 'success' }

            result = if blocked
                       step_result(step, 'skipped', errors: ['dependency_failed'])
                     elsif dry_run
                       step_result(step, 'pending')
                     else
                       execute_step(step, plan, actor: actor, project_id: project_id)
                     end

            states[domain] = result['status']
            result
          end

          {
            'extension_id' => plan['extension_id'],
            'status' => overall_status(results, dry_run: dry_run),
            'dry_run' => !!dry_run,
            'steps' => results.freeze,
            'dirty_domains' => (dry_run ? [] : dirty_domains(steps, results)).freeze
          }.freeze
        end

        private

        def execute_step(step, plan, actor:, project_id:)
          domain = step.fetch('domain').to_s
          command_name = @command_resolver.call(domain, step)
          return step_result(step, 'failed', errors: ["no command registered for #{domain}"]) unless command_name

          result = @command_bus.execute(
            command_name,
            {
              'extension_id' => plan['extension_id'],
              'program' => plan['program'],
              'mode' => plan['mode'],
              'intent_action' => step['action'],
              'intent' => step['intent'] || {}
            },
            actor: actor,
            project_id: project_id
          )

          step_result(
            step,
            result[:status],
            command_id: result[:command_id],
            created_object_ids: result[:created_object_ids],
            updated_object_ids: result[:updated_object_ids],
            removed_object_ids: result[:removed_object_ids],
            warnings: result[:warnings],
            errors: result[:errors]
          )
        end

        def default_command_for(domain, _step)
          "GenerateOrUpdate#{domain.split('_').map(&:capitalize).join}FromExtension"
        end

        def step_result(step, status, command_id: nil, created_object_ids: [], updated_object_ids: [],
                        removed_object_ids: [], warnings: [], errors: [])
          {
            'domain' => step.fetch('domain').to_s,
            'geometry_owner' => step['geometry_owner'],
            'action' => step['action'],
            'intent' => step['intent'] || {},
            'status' => status.to_s,
            'command_id' => command_id,
            'created_object_ids' => Array(created_object_ids).map(&:to_s).freeze,
            'updated_object_ids' => Array(updated_object_ids).map(&:to_s).freeze,
            'removed_object_ids' => Array(removed_object_ids).map(&:to_s).freeze,
            'warnings' => Array(warnings).map(&:to_s).freeze,
            'errors' => Array(errors).map(&:to_s).freeze
          }.freeze
        end

        def overall_status(results, dry_run:)
          return 'preview' if dry_run
          return 'failed' if results.any? { |result| FAILURE_STATUSES.include?(result['status']) }
          return 'partial' if results.any? { |result| result['status'] == 'skipped' }
          'success'
        end

        # Dirty only domains whose own execution failed/rejected plus their transitive
        # dependents. Independent later steps are not dirty merely because they
        # appear after a failure. Explicitly skipped domains are not roots; a
        # dependency_failed skip is included only when reachable from a failed root.
        def dirty_domains(steps, results)
          failed = results.select { |result| FAILURE_STATUSES.include?(result['status']) }.map { |result| result['domain'] }
          return [] if failed.empty?

          dependents = build_dependents(steps)
          dirty = failed.dup
          queue = failed.dup
          until queue.empty?
            domain = queue.shift
            Array(dependents[domain]).each do |dependent|
              next if dirty.include?(dependent)
              dirty << dependent
              queue << dependent
            end
          end

          order = steps.map { |step| step.fetch('domain').to_s }
          order.select { |domain| dirty.include?(domain) }
        end

        def build_dependents(steps)
          steps.each_with_object(Hash.new { |hash, key| hash[key] = [] }) do |step, result|
            domain = step.fetch('domain').to_s
            Array(step['dependencies']).map(&:to_s).each do |dependency|
              result[dependency] << domain unless result[dependency].include?(domain)
            end
          end
        end
      end
    end
  end
end
