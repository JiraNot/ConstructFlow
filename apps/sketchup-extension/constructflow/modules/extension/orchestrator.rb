# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      class Orchestrator
        DOMAIN_ORDER = %w[architecture structure surface roof drainage interior electrical].freeze
        DEPENDENCIES = {
          'architecture' => [],
          'structure' => [],
          'surface' => ['structure'],
          'roof' => ['structure'],
          'drainage' => ['roof', 'surface'],
          'interior' => ['structure', 'surface'],
          'electrical' => ['structure', 'interior']
        }.freeze
        DISABLE_RECONCILIATION_DOMAINS = %w[drainage].freeze

        def initialize(generator)
          @generator = generator
        end

        def plan(options = {})
          intent = @generator.intents(options)
          enabled = @generator.enabled_domains(options)
          transition_domains = disabled_reconciliation_domains(intent)
          requested = (enabled + transition_domains).uniq
          ordered = topological_order(requested)
          steps = ordered.map do |domain|
            config = intent.fetch('domains').fetch(domain, {})
            {
              'domain' => domain,
              'dependencies' => DEPENDENCIES.fetch(domain, []).select { |dependency| requested.include?(dependency) },
              'action' => explicit_disable?(config) ? 'reconcile_disabled_intent' : 'generate_or_update_intent',
              'geometry_owner' => "constructflow.#{domain}",
              'intent' => domain_intent(intent, domain)
            }
          end

          {
            'extension_id' => intent['extension_id'],
            'program' => intent['program'],
            'mode' => intent['mode'],
            'steps' => steps,
            'regeneration' => regeneration_rules
          }.freeze
        end

        private

        def disabled_reconciliation_domains(intent)
          domains = intent.fetch('domains', {})
          DISABLE_RECONCILIATION_DOMAINS.select do |domain|
            config = domains[domain]
            config.is_a?(Hash) && explicit_disable?(config)
          end
        end

        def explicit_disable?(config)
          config.is_a?(Hash) && config.key?('enabled') && config['enabled'] == false
        end

        def domain_intent(intent, domain)
          {
            'extension_id' => intent['extension_id'],
            'program' => intent['program'],
            'mode' => intent['mode'],
            'boundary_mm' => intent['boundary_mm'],
            'base_level_id' => intent['base_level_id'],
            'base_offset_mm' => intent['base_offset_mm'],
            'target_height_mm' => intent['target_height_mm'],
            'roof_intent' => intent['roof_intent'],
            'attachment_host_id' => intent['attachment_host_id'],
            'config' => intent.fetch('domains').fetch(domain, {})
          }.freeze
        end

        def topological_order(domains)
          requested = domains.map(&:to_s).uniq
          result = []
          visiting = {}
          visited = {}

          visit = lambda do |domain|
            return if visited[domain]
            raise ArgumentError, "cyclic extension dependency: #{domain}" if visiting[domain]

            visiting[domain] = true
            DEPENDENCIES.fetch(domain, []).each { |dependency| visit.call(dependency) if requested.include?(dependency) }
            visiting.delete(domain)
            visited[domain] = true
            result << domain
          end

          DOMAIN_ORDER.each { |domain| visit.call(domain) if requested.include?(domain) }
          result
        end

        def regeneration_rules
          {
            'boundary_changed' => %w[architecture structure surface roof drainage interior electrical],
            'height_changed' => %w[architecture structure roof drainage electrical interior],
            'architecture_changed' => %w[architecture interior electrical],
            'roof_changed' => %w[roof drainage],
            'surface_changed' => %w[surface drainage interior],
            'structure_changed' => %w[structure roof electrical interior]
          }.freeze
        end
      end
    end
  end
end
