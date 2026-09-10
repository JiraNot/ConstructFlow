# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class LayoutTemplateAsset
        attr_reader :key, :version, :path, :paper_size, :orientation, :drawing_families,
                    :issue_kinds, :placeholder_map, :metadata

        def initialize(key:, version:, path:, paper_size:, orientation:, drawing_families: [],
                       issue_kinds: [], placeholder_map: nil, metadata: {})
          @key = required(key, 'template key')
          @version = required(version, 'template version')
          @path = required(path, 'template path')
          @paper_size = required(paper_size, 'paper size').upcase
          @orientation = required(orientation, 'orientation')
          @drawing_families = Array(drawing_families).map(&:to_s).uniq.freeze
          @issue_kinds = Array(issue_kinds).map(&:to_s).uniq.freeze
          @placeholder_map = placeholder_map
          @metadata = stringify_keys(metadata || {}).freeze
          freeze
        end

        def identity
          "#{key}@#{version}"
        end

        def matches?(paper_size:, orientation:, drawing_family: nil, issue_kind: nil)
          return false unless self.paper_size == paper_size.to_s.upcase
          return false unless self.orientation == orientation.to_s
          return false if drawing_family && !drawing_families.empty? && !drawing_families.include?(drawing_family.to_s)
          return false if issue_kind && !issue_kinds.empty? && !issue_kinds.include?(issue_kind.to_s)
          true
        end

        def to_h
          {
            'key' => key,
            'version' => version,
            'identity' => identity,
            'path' => path,
            'paper_size' => paper_size,
            'orientation' => orientation,
            'drawing_families' => drawing_families,
            'issue_kinds' => issue_kinds,
            'metadata' => metadata
          }.freeze
        end

        private

        def required(value, label)
          text = value.to_s
          raise ArgumentError, "#{label} required" if text.empty?
          text
        end

        def stringify_keys(value)
          value.each_with_object({}) { |(key, item), result| result[key.to_s] = item }
        end
      end

      class LayoutTemplateRegistry
        def initialize
          @assets = {}
          @latest_versions = {}
        end

        def register(asset)
          raise ArgumentError, 'LayoutTemplateAsset required' unless asset.is_a?(LayoutTemplateAsset)
          key = [asset.key, asset.version]
          raise ArgumentError, "template already registered: #{asset.identity}" if @assets.key?(key)

          @assets[key] = asset
          @latest_versions[asset.key] = asset.version
          asset
        end

        def fetch!(key, version: nil)
          template_key = key.to_s
          template_version = version.to_s
          template_version = @latest_versions[template_key].to_s if template_version.empty?
          asset = @assets[[template_key, template_version]]
          raise KeyError, "unknown layout template: #{template_key}@#{template_version}" unless asset
          asset
        end

        def resolve(key:, version: nil, paper_size:, orientation:, drawing_family: nil, issue_kind: nil)
          asset = fetch!(key, version: version)
          return asset if asset.matches?(
            paper_size: paper_size,
            orientation: orientation,
            drawing_family: drawing_family,
            issue_kind: issue_kind
          )

          raise ArgumentError,
                "layout template #{asset.identity} incompatible with #{paper_size} #{orientation} " \
                "#{drawing_family} #{issue_kind}".strip
        end

        def versions(key)
          @assets.keys.select { |item| item.first == key.to_s }.map(&:last).sort.freeze
        end
      end
    end
  end
end
