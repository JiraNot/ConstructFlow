# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Extension
      # Builds a deterministic cross-module execution plan without owning
      # geometry from the participating domain modules.
      class Orchestrator
        DOMAIN_ORDER = %i[structure surface roof drainage electrical interior].freeze
        DEPENDENCIES = {
          structure: [],
          surface: [:structure],
          roof: [:structure],
          drainage: [:roof, :surface],
          electrical: [:structure, :interior],
          interior: [:structure, :surface]
        }.freeze

        def initialize(generator)
          @generator = generator
        end

        def plan(options = {})
          intent = @generator.intents(options)
          enabled = @generator.enabled_domains(options)
          ordered = topological_order(enabled.map(&:to_sym))
          steps = ordered.map do |domain|
            {
              domain: domain.to_s,
              dependencies: DEPENDENCIES.fetch(domain, []).select { |dependency| enabled.include?(dependency.to_s) },
              action: 'generate_or_update_intent',
              geometry_owner: domain.to_s
            }
          end

          {
            extension_id: intent[:extension_id],
            mode: intent[:mode],
            program: intent[:program],
            boundary_mm: intent[:boundary_mm],
            steps: steps,
            regeneration: regeneration_rules
          }.freeze
        end

        private

        def topological_order(domains)
          requested = domains.uniq
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
            boundary_changed: %w[structure surface roof drainage electrical interior],
            height_changed: %w[structure roof drainage electrical interior],
            roof_changed: %w[roof drainage],
            surface_changed: %w[surface drainage interior],
            structure_changed: %w[structure roof electrical interior]
          }
        end
      end
    end
  end
end
