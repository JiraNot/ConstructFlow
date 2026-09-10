# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class LayoutTemplateDefinition
        attr_reader :key, :version, :path, :paper_size, :orientation, :drawing_families,
                    :use_cases, :placeholder_tokens, :revision_prefix, :strategy, :metadata

        def initialize(key:, version:, path:, paper_size:, orientation:, drawing_families: ['*'], use_cases: ['construction'],
                       placeholder_tokens: {}, revision_prefix: 'CF:REV', strategy: 'prefer_template', metadata: {})
          @key = required(key, 'template key')
          @version = required(version, 'template version')
          @path = required(path, 'template path')
          @paper_size = required(paper_size, 'paper_size').upcase
          @orientation = required(orientation, 'orientation').downcase
          @drawing_families = normalize_list(drawing_families)
          @use_cases = normalize_list(use_cases)
          @placeholder_tokens = stringify_keys(placeholder_tokens || {}).freeze
          @revision_prefix = required(revision_prefix, 'revision_prefix')
          @strategy = strategy.to_s
          @metadata = stringify_keys(metadata || {}).freeze
          raise ArgumentError, 'template path must end with .layout' unless File.extname(@path).downcase == '.layout'
          raise ArgumentError, "unsupported template strategy: #{@strategy}" unless LayoutTemplatePlaceholderMap::STRATEGIES.include?(@strategy)
          freeze
        end

        def supports?(paper_size:, orientation:, drawing_family:, use_case:)
          paper_size.to_s.upcase == self.paper_size &&
            orientation.to_s.downcase == self.orientation &&
            matches?(drawing_families, drawing_family) &&
            matches?(use_cases, use_case)
        end

        def to_h
          {
            'key' => key,
            'version' => version,
            'path' => path,
            'paper_size' => paper_size,
            'orientation' => orientation,
            'drawing_families' => drawing_families,
            'use_cases' => use_cases,
            'placeholder_tokens' => placeholder_tokens,
            'revision_prefix' => revision_prefix,
            'strategy' => strategy,
            'metadata' => metadata
          }.freeze
        end

        private

        def matches?(values, candidate)
          values.include?('*') || values.include?(candidate.to_s)
        end

        def normalize_list(values)
          list = Array(values).map(&:to_s).reject(&:empty?).uniq
          raise ArgumentError, 'template matcher list must not be empty' if list.empty?
          list.freeze
        end

        def stringify_keys(value)
          value.each_with_object({}) { |(key, item), result| result[key.to_s] = item }
        end

        def required(value, label)
          text = value.to_s
          raise ArgumentError, "#{label} required" if text.empty?
          text
        end
      end

      class LayoutTemplateRegistry
        def initialize
          @definitions = {}
        end

        def register(definition)
          raise ArgumentError, 'definition must be LayoutTemplateDefinition' unless definition.is_a?(LayoutTemplateDefinition)
          @definitions[identity(definition.key, definition.version)] = definition
          definition
        end

        def fetch!(key, version: nil)
          matches = @definitions.values.select { |item| item.key == key.to_s }
          raise KeyError, "unknown LayOut template: #{key}" if matches.empty?
          return matches.find { |item| item.version == version.to_s } || raise(KeyError, "unknown LayOut template version: #{key}@#{version}") if version
          newest(matches)
        end

        def resolve!(paper_size:, orientation:, drawing_family:, use_case: 'construction', preferred_key: nil, preferred_version: nil)
          if preferred_key
            definition = fetch!(preferred_key, version: preferred_version)
            unless definition.supports?(paper_size: paper_size, orientation: orientation, drawing_family: drawing_family, use_case: use_case)
              raise ArgumentError, "LayOut template #{definition.key}@#{definition.version} is incompatible with requested sheet"
            end
            return definition
          end

          matches = @definitions.values.select do |definition|
            definition.supports?(paper_size: paper_size, orientation: orientation, drawing_family: drawing_family, use_case: use_case)
          end
          raise KeyError, "no LayOut template for #{paper_size} #{orientation} #{drawing_family} #{use_case}" if matches.empty?
          newest(matches)
        end

        def all
          @definitions.values.sort_by { |item| [item.key, version_parts(item.version)] }.freeze
        end

        private

        def identity(key, version)
          "#{key}@#{version}"
        end

        def newest(values)
          values.max_by { |item| version_parts(item.version) }
        end

        def version_parts(version)
          version.to_s.scan(/\d+/).map(&:to_i)
        end
      end
    end
  end
end
