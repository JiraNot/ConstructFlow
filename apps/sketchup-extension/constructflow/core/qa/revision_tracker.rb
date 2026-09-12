# frozen_string_literal: true

require 'digest'
require 'time'

module JiraNot
  module ConstructFlow
    module Core
      module QA
        class RevisionReport
          attr_reader :from_revision, :to_revision, :timestamp, :author,
                      :description, :added, :removed, :modified, :clouds

          def initialize(from_revision:, to_revision:, timestamp: Time.now.iso8601,
                         author: 'system', description: '', added: [], removed: [],
                         modified: [], clouds: [])
            @from_revision = from_revision.to_s.strip
            @to_revision = to_revision.to_s.strip
            @timestamp = timestamp.to_s.strip
            @author = author.to_s.strip
            @description = description.to_s.strip
            @added = Array(added).freeze
            @removed = Array(removed).freeze
            @modified = Array(modified).freeze
            @clouds = Array(clouds).freeze
            freeze
          end

          def change_count
            added.length + removed.length + modified.length
          end

          def changed?
            change_count.positive?
          end

          def to_h
            {
              'from_revision' => from_revision,
              'to_revision' => to_revision,
              'timestamp' => timestamp,
              'author' => author,
              'description' => description,
              'change_count' => change_count,
              'added' => added,
              'removed' => removed,
              'modified' => modified,
              'clouds' => clouds
            }
          end
        end

        class RevisionTracker
          def compare(from_objects:, to_objects:, from_revision: 'P01', to_revision: 'P02', author: 'system', description: '')
            from_map = normalize_map(from_objects)
            to_map = normalize_map(to_objects)

            added = []
            removed = []
            modified = []
            clouds = []

            # Check for additions and modifications
            to_map.each do |id, to_data|
              if from_map.key?(id)
                from_data = from_map[id]
                if object_hash(from_data) != object_hash(to_data)
                  diff_fields = extract_differences(from_data, to_data)
                  modified << { id: id, changes: diff_fields }
                  cloud = build_revision_cloud(id, to_data, to_revision)
                  clouds << cloud if cloud
                end
              else
                added << { id: id, type: to_data[:type] || to_data['type'] }
                cloud = build_revision_cloud(id, to_data, to_revision)
                clouds << cloud if cloud
              end
            end

            # Check for removals
            from_map.each do |id, from_data|
              unless to_map.key?(id)
                removed << { id: id, type: from_data[:type] || from_data['type'] }
              end
            end

            RevisionReport.new(
              from_revision: from_revision,
              to_revision: to_revision,
              timestamp: Time.now.iso8601,
              author: author,
              description: description,
              added: added,
              removed: removed,
              modified: modified,
              clouds: clouds
            )
          end

          private

          def normalize_map(objects)
            case objects
            when Hash then objects
            when Array
              objects.each_with_object({}) do |obj, h|
                id = get_id(obj)
                h[id] = obj if id
              end
            else
              {}
            end
          end

          def get_id(obj)
            if obj.respond_to?(:id)
              obj.id
            elsif obj.is_a?(Hash)
              obj[:id] || obj['id'] || obj[:object_id] || obj['object_id']
            end
          end

          def object_hash(data)
            payload = data.respond_to?(:to_h) ? data.to_h : data
            Digest::SHA256.hexdigest(payload.inspect)
          end

          def extract_differences(from_data, to_data)
            h1 = from_data.respond_to?(:to_h) ? from_data.to_h : from_data
            h2 = to_data.respond_to?(:to_h) ? to_data.to_h : to_data

            diffs = {}
            (h1.keys | h2.keys).each do |k|
              v1 = h1[k]
              v2 = h2[k]
              diffs[k] = { from: v1, to: v2 } if v1 != v2
            end
            diffs
          end

          def build_revision_cloud(id, data, revision)
            bounds = data[:bounds_mm] || data['bounds_mm'] || data[:location_mm] || data['location_mm']
            return nil unless bounds

            {
              object_id: id,
              revision: revision,
              tag: "Δ #{revision}",
              bounds_mm: bounds
            }
          end
        end
      end
    end
  end
end
