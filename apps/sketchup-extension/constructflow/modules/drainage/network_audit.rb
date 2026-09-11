# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Drainage
      class NetworkAudit
        def initialize(runtime:, repository: Repository.new, validator: Validators::DrainageValidator.new)
          @runtime = runtime
          @repository = repository
          @validator = validator
        end

        def run
          issues = drainage_objects.flat_map { |object| issues_for(object) }
          {
            'status' => issues.any? { |issue| issue['severity'] == 'error' } ? 'error' : (issues.empty? ? 'clear' : 'warning'),
            'object_count' => drainage_objects.length,
            'issue_count' => issues.length,
            'issues' => issues.freeze
          }.freeze
        end

        private

        def drainage_objects
          @drainage_objects ||= @runtime.smart_objects.all.select { |object| object.owner_module == 'constructflow.drainage' }
        end

        def issues_for(object)
          case object.type
          when 'drainage.pipe_route' then route_issues(object)
          when 'drainage.manhole' then manhole_issues(object)
          when 'drainage.downpipe' then downpipe_issues(object)
          else []
          end
        end

        def route_issues(object)
          definition = @repository.read_pipe_route(object.entity)
          return [issue(object, 'drainage.route.definition_missing', 'error', 'route definition missing')] unless definition
          issues = @validator.validate_route(definition).map do |value|
            issue(object, value[:rule_id], value[:severity], value[:message], state: value[:state])
          end
          issues.concat(topology_issues(object, definition, require_connection: false))
          issues.concat(structure_clashes(object, definition))
          issues
        end

        def downpipe_issues(object)
          definition = @repository.read_downpipe(object.entity)
          return [issue(object, 'drainage.downpipe.definition_missing', 'error', 'downpipe definition missing')] unless definition

          issues = definition.errors.map do |message|
            issue(object, 'drainage.downpipe.validity', 'error', message)
          end
          issues.concat(topology_issues(object, definition, require_connection: true)) if definition.valid?
          issues.concat(structure_clashes(object, definition)) if definition.valid?
          issues
        end

        def topology_issues(object, definition, require_connection: false)
          issues = []
          connection = @runtime.connectors.connection_for_route(object.id)
          if definition.connection_id && connection.nil?
            issues << issue(object, 'drainage.route.connection_missing', 'error', 'route references a connection that is missing from network topology')
          elsif connection && definition.connection_id.to_s != connection['id'].to_s
            issues << issue(object, 'drainage.route.connection_mismatch', 'error', 'route definition connection does not match topology connection')
          end
          if connection
            expected = [definition.start_connector_id, definition.end_connector_id].sort
            actual = [connection['from_connector_id'], connection['to_connector_id']].sort
            issues << issue(object, 'drainage.route.endpoint_mismatch', 'error', 'route connector endpoints do not match topology connection') unless expected == actual
          elsif require_connection && definition.connection_id.to_s.empty?
            issues << issue(object, 'drainage.route.connection_missing', 'error', 'route has no active network connection')
          end
          issues
        end

        def manhole_issues(object)
          definition = @repository.read_manhole(object.entity)
          return [issue(object, 'drainage.manhole.definition_missing', 'error', 'manhole definition missing')] unless definition
          @validator.validate_manhole(definition).map { |value| issue(object, value[:rule_id], value[:severity], value[:message]) }
        end

        def structure_clashes(object, definition)
          evaluation = RouteCandidateEvaluator.new(runtime: @runtime).evaluate(definition.route_nodes_mm)
          evaluation['clashes'].map do |clash|
            issue(object, 'drainage.route.structure_clash', 'error', "route intersects #{clash['object_type']} #{clash['object_id']}", evidence: clash)
          end
        end

        def issue(object, rule_id, severity, message, extra = {})
          {
            'rule_id' => rule_id.to_s,
            'severity' => severity.to_s,
            'message' => message.to_s,
            'object_id' => object.id,
            'object_type' => object.type
          }.merge(extra.transform_keys(&:to_s)).freeze
        end
      end
    end
  end
end
