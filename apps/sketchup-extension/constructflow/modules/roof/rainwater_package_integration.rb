# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Roof
      # Adds Extension provenance to gutters created from an Extension-generated
      # Roof without changing the Roof-owned gutter creation contract itself.
      module RainwaterExtensionProvenancePatch
        private

        def create_gutter(roof_object, **options)
          gutter = super
          extension_id = extension_source_id(roof_object)
          add_extension_provenance(gutter, extension_id) if extension_id
          gutter
        end

        def extension_source_id(roof_object)
          relation = Array(roof_object.relationships).find do |value|
            (value['kind'] || value[:kind]).to_s == 'generated_from' &&
              (value['role'] || value[:role]).to_s == 'extension_source'
          end
          source_id = relation && (relation['target_id'] || relation[:target_id]).to_s
          return nil if source_id.to_s.empty?

          source = @runtime.smart_objects.fetch_by_id(source_id)
          source&.type.to_s == 'extension.zone' ? source.id.to_s : nil
        end

        def add_extension_provenance(gutter, extension_id)
          exists = Array(gutter.relationships).any? do |value|
            (value['kind'] || value[:kind]).to_s == 'generated_from' &&
              (value['target_id'] || value[:target_id]).to_s == extension_id.to_s
          end
          return if exists

          @runtime.smart_objects.add_relationship(
            gutter.entity,
            kind: 'generated_from',
            target_id: extension_id,
            role: 'extension_source',
            metadata: { 'domain' => 'roof', 'slot' => 'rainwater_gutter' }
          )
        end
      end

      # Reviews only applied plan-managed rainwater outlets. It never invents a
      # target network and never mutates topology. Construction QA can therefore
      # block an incomplete package while Design/working views keep the issue as a
      # warning.
      class RainwaterPackageAudit
        SYSTEM = 'drainage.rainwater'

        def initialize(runtime:)
          @runtime = runtime
        end

        def run(object_ids:, strict: false)
          ids = Array(object_ids).map(&:to_s)
          issues = []
          ids.each do |id|
            gutter = @runtime.smart_objects.fetch_by_id(id)
            next unless gutter && gutter.owner_module.to_s == 'constructflow.roof' && gutter.type.to_s == 'roof.gutter'

            evidence = application_evidence(gutter)
            next unless evidence

            expected_ids = Array(evidence['outlet_connector_ids']).map(&:to_s).reject(&:empty?)
            if expected_ids.empty?
              issues << issue(
                'construction.rainwater.outlet_evidence_missing',
                'error', gutter,
                'applied rainwater plan has no outlet connector evidence'
              )
              next
            end

            expected_ids.each do |connector_id|
              connector = connector_or_nil(connector_id)
              unless connector && connector['owner_object_id'].to_s == gutter.id.to_s &&
                     connector['type'].to_s == 'roof.gutter_outlet' && connector['state'].to_s != 'disabled'
                issues << issue(
                  'construction.rainwater.outlet_missing',
                  'error', gutter,
                  "applied rainwater outlet #{connector_id} is missing, disabled or no longer owned by the gutter",
                  connector_id: connector_id
                )
                next
              end

              connections = downpipe_connections(connector_id)
              if connections.empty?
                issues << issue(
                  'construction.rainwater.outlet_unconnected',
                  strict ? 'error' : 'warning', gutter,
                  "rainwater outlet #{connector_id} has no explicit downpipe destination connection",
                  connector_id: connector_id
                )
                next
              end

              connections.each do |connection|
                route_id = connection.fetch('metadata', {})['route_object_id'].to_s
                route = @runtime.smart_objects.fetch_by_id(route_id)
                unless route && route.owner_module.to_s == 'constructflow.drainage' && route.type.to_s == 'drainage.downpipe'
                  issues << issue(
                    'construction.rainwater.downpipe_missing',
                    'error', gutter,
                    "rainwater outlet #{connector_id} references missing semantic downpipe #{route_id}",
                    connector_id: connector_id,
                    connection_id: connection['id'],
                    route_object_id: route_id
                  )
                  next
                end
                unless ids.include?(route.id.to_s)
                  issues << issue(
                    'construction.rainwater.downpipe_out_of_scope',
                    'error', gutter,
                    "downpipe #{route.id} is connected to the Extension gutter but is not in the current construction package scope",
                    connector_id: connector_id,
                    connection_id: connection['id'],
                    route_object_id: route.id
                  )
                end
              end
            end
          end
          {
            'status' => issues.any? { |value| value['severity'] == 'error' } ? 'error' : (issues.empty? ? 'clear' : 'warning'),
            'issues' => issues.freeze
          }.freeze
        end

        private

        def application_evidence(gutter)
          Core::AttributeStore.new(gutter.entity).read_json(
            RainwaterPlanApplier::EVIDENCE_KEY,
            nil,
            dictionary: Repository::DICTIONARY
          )
        rescue StandardError
          nil
        end

        def connector_or_nil(connector_id)
          @runtime.connectors.connector(connector_id)
        rescue KeyError
          nil
        end

        def downpipe_connections(connector_id)
          @runtime.connectors.connections_for_connector(connector_id).select do |connection|
            connection['system'].to_s == SYSTEM &&
              connection.fetch('metadata', {})['route_kind'].to_s == 'downpipe'
          end
        end

        def issue(rule_id, severity, object, message, extra = {})
          {
            'rule_id' => rule_id.to_s,
            'severity' => severity.to_s,
            'message' => message.to_s,
            'object_id' => object&.id,
            'object_type' => object&.type
          }.merge(extra.transform_keys(&:to_s)).freeze
        end
      end
    end
  end
end

if defined?(JiraNot::ConstructFlow::Roof::RainwaterPlanApplier) &&
   !JiraNot::ConstructFlow::Roof::RainwaterPlanApplier.ancestors.include?(
     JiraNot::ConstructFlow::Roof::RainwaterExtensionProvenancePatch
   )
  JiraNot::ConstructFlow::Roof::RainwaterPlanApplier.prepend(
    JiraNot::ConstructFlow::Roof::RainwaterExtensionProvenancePatch
  )
end
