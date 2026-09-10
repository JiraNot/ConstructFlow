# frozen_string_literal: true

require 'digest'
require 'time'

module JiraNot
  module ConstructFlow
    module Extension
      class ConstructionOutputSettlement
        FORMAT = 'constructflow.extension_construction_output_settlement.v1'
        STATE_DICTIONARY = 'constructflow.extension'
        STATE_KEY = 'construction_output_state'
        STATE_SCHEMA_VERSION = 1
        QUANTITY_SETTLED_STATUSES = %w[included unsupported_type].freeze

        def initialize(runtime:)
          @runtime = runtime
        end

        def settle(extension_id:, takeoff:, issue_set:, drawing_refresh:, drawings_required: false)
          source = resolve_extension(extension_id)
          quantity = settle_quantities(takeoff)
          drawing = settle_drawings(source, issue_set, drawing_refresh)
          required_drawing_clear = !drawings_required || drawing['complete']
          publishable = quantity['complete'] && required_drawing_clear

          {
            'format' => FORMAT,
            'extension_id' => source.id,
            'status' => publishable ? 'settled' : 'partial',
            'publishable' => publishable,
            'drawings_required' => drawings_required == true,
            'quantity' => quantity,
            'drawing' => drawing,
            'takeoff_fingerprint' => takeoff_fingerprint(takeoff),
            'drawing_fingerprint' => drawing_fingerprint(drawing_refresh)
          }.freeze
        end

        def record(extension_id:, settlement:, currentness:, revision:, issue_status:, export_requested: false, export_result: nil)
          source = resolve_extension(extension_id)
          payload = {
            'schema_version' => STATE_SCHEMA_VERSION,
            'extension_id' => source.id,
            'revision' => revision.to_s,
            'issue_status' => issue_status.to_s,
            'settlement_status' => settlement && settlement['status'].to_s,
            'settlement_publishable' => settlement && settlement['publishable'] == true,
            'takeoff_fingerprint' => settlement && settlement['takeoff_fingerprint'].to_s,
            'drawing_fingerprint' => settlement && settlement['drawing_fingerprint'].to_s,
            'scope_fingerprint' => currentness && currentness['scope_fingerprint'].to_s,
            'currentness_status' => currentness && currentness['status'].to_s,
            'currentness_publishable' => currentness && currentness['publishable'] == true,
            'settled_quantity_object_ids' => Array(settlement && settlement.dig('quantity', 'settled_object_ids')).map(&:to_s).sort,
            'settled_drawing_object_ids' => Array(settlement && settlement.dig('drawing', 'settled_object_ids')).map(&:to_s).sort,
            'export_status' => export_status(export_requested, export_result),
            'recorded_at' => Time.now.utc.iso8601
          }.freeze
          Core::AttributeStore.new(source.entity).write_json(
            STATE_KEY,
            payload,
            dictionary: STATE_DICTIONARY
          )
          payload
        end

        def read(extension_id)
          source = resolve_extension(extension_id)
          payload = Core::AttributeStore.new(source.entity).read_json(
            STATE_KEY,
            nil,
            dictionary: STATE_DICTIONARY
          )
          normalize_state(payload)
        end

        private

        def settle_quantities(takeoff)
          coverage = Array(takeoff && takeoff['coverage'])
          failed = coverage.reject { |entry| QUANTITY_SETTLED_STATUSES.include?(entry['status'].to_s) }
          settled_ids = coverage.filter_map do |entry|
            next unless QUANTITY_SETTLED_STATUSES.include?(entry['status'].to_s)
            object = @runtime.smart_objects.fetch_by_id(entry['object_id'].to_s)
            next unless object
            @runtime.smart_objects.clear_dirty(object.entity, 'dirty_quantity')
            object.id.to_s
          end.uniq.sort.freeze

          {
            'complete' => failed.empty?,
            'settled_object_ids' => settled_ids,
            'unsettled_object_ids' => failed.map { |entry| entry['object_id'].to_s }.reject(&:empty?).uniq.sort.freeze,
            'unsettled_statuses' => failed.map { |entry| entry['status'].to_s }.reject(&:empty?).uniq.sort.freeze
          }.freeze
        end

        def settle_drawings(source, issue_set, drawing_refresh)
          expected_presets = Array(issue_set && issue_set.sheets).map { |request| request.preset_id.to_s }.reject(&:empty?).uniq
          entries = Array(drawing_refresh)
          actual_presets = entries.map { |entry| entry['preset_id'].to_s }.reject(&:empty?).uniq
          missing_presets = (expected_presets - actual_presets).sort.freeze
          extra_presets = (actual_presets - expected_presets).sort.freeze
          missing_rendered = []
          stale_rendered = []
          settled_ids = []

          entries.each do |entry|
            requested = Array(entry['source_object_ids']).map(&:to_s).reject(&:empty?).uniq
            rendered = Array(entry['rendered_object_ids']).map(&:to_s).reject(&:empty?).uniq
            missing_rendered.concat(requested - rendered)
            rendered.each do |object_id|
              object = @runtime.smart_objects.fetch_by_id(object_id)
              if object
                @runtime.smart_objects.clear_dirty(object.entity, 'dirty_drawing')
                settled_ids << object.id.to_s
              else
                stale_rendered << object_id
              end
            end
          end

          complete = missing_presets.empty? && extra_presets.empty? && missing_rendered.empty? && stale_rendered.empty?
          if complete && !expected_presets.empty?
            @runtime.smart_objects.clear_dirty(source.entity, 'dirty_drawing')
            settled_ids << source.id.to_s
          end

          {
            'complete' => complete,
            'expected_preset_ids' => expected_presets.sort.freeze,
            'refreshed_preset_ids' => actual_presets.sort.freeze,
            'missing_preset_ids' => missing_presets,
            'extra_preset_ids' => extra_presets,
            'missing_rendered_object_ids' => missing_rendered.uniq.sort.freeze,
            'stale_rendered_object_ids' => stale_rendered.uniq.sort.freeze,
            'settled_object_ids' => settled_ids.uniq.sort.freeze
          }.freeze
        end

        def takeoff_fingerprint(takeoff)
          rows = Array(takeoff && takeoff['coverage']).map do |entry|
            [entry['object_id'], entry['object_type'], entry['source_module'], entry['status'], entry['item_count']].map(&:to_s).join('|')
          end.sort
          totals = Array(takeoff && takeoff['totals']).map do |entry|
            [
              entry['phase_scope'], entry['classification'], entry['unit'], entry['value'],
              Array(entry['source_object_ids']).map(&:to_s).sort.join(',')
            ].map(&:to_s).join('|')
          end.sort
          Digest::SHA256.hexdigest((rows + totals).join("\n"))
        end

        def drawing_fingerprint(drawing_refresh)
          rows = Array(drawing_refresh).map do |entry|
            [
              entry['preset_id'], entry['scene_name'],
              Array(entry['source_object_ids']).map(&:to_s).sort.join(','),
              Array(entry['rendered_object_ids']).map(&:to_s).sort.join(',')
            ].map(&:to_s).join('|')
          end.sort
          Digest::SHA256.hexdigest(rows.join("\n"))
        end

        def export_status(requested, result)
          return 'not_requested' unless requested
          result.nil? ? 'failed' : 'exported'
        end

        def normalize_state(payload)
          return nil if payload.nil?
          data = payload.each_with_object({}) { |(key, value), result| result[key.to_s] = value }
          version = Integer(data['schema_version'] || 1)
          raise ArgumentError, "unsupported construction output state schema version: #{version}" unless version == STATE_SCHEMA_VERSION
          data.freeze
        rescue TypeError, ArgumentError => error
          raise ArgumentError, "invalid construction output state: #{error.message}"
        end

        def resolve_extension(extension_id)
          object = @runtime.smart_objects.fetch_by_id(extension_id.to_s)
          return object if object && object.type == 'extension.zone' && object.owner_module == 'constructflow.extension'
          raise ArgumentError, 'extension zone not found'
        end
      end
    end
  end
end
