# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class NativeAcceptancePreflight
        MANAGED_TAG_PREFIX = 'CF-'

        def initialize(runtime:)
          @runtime = runtime
        end

        def run(extension_id: nil)
          model = @runtime.active_model
          checks = []
          warnings = []

          checks << check('active_model', !model.nil?, 'active SketchUp model is available')
          return result(checks: checks, warnings: warnings, coverage: {}, extension_id: extension_id) unless model

          model_path = model.respond_to?(:path) ? model.path.to_s : ''
          checks << check('saved_model', !model_path.empty?, 'model has a saved .skp path')
          checks << check(
            'undo_redo_api',
            model.respond_to?(:undo) && model.respond_to?(:redo),
            'native model exposes Undo and Redo operations'
          )

          project_id = @runtime.project&.project_id.to_s
          checks << check('project_id', !project_id.empty?, 'ConstructFlow project identity is initialized')

          objects = smart_objects
          checks << check('smart_objects', !objects.empty?, 'model contains ConstructFlow Smart Objects', count: objects.length)

          scenes = collection_names(model.respond_to?(:pages) ? model.pages : nil)
          checks << check('scenes', !scenes.empty?, 'model contains at least one scene', count: scenes.length)

          managed_tags = collection_names(model.respond_to?(:layers) ? model.layers : nil).select do |name|
            name.start_with?(MANAGED_TAG_PREFIX)
          end
          checks << check(
            'managed_tags',
            !managed_tags.empty?,
            'model contains managed ConstructFlow CF-* tags',
            count: managed_tags.length
          )

          coverage = coverage_for(objects)
          extension = nil
          unless extension_id.to_s.strip.empty?
            extension = fetch_object(extension_id)
            checks << check(
              'extension_exists',
              extension && extension.type.to_s == 'extension.zone',
              'selected acceptance source is an extension.zone',
              object_id: extension_id.to_s
            )
            related = extension ? generated_from(objects, extension.id) : []
            checks << check(
              'extension_generated_scope',
              !related.empty?,
              'selected Extension has generated related Smart Objects',
              count: related.length
            )
            coverage = coverage_for(related, source: extension)
          end

          warnings.concat(coverage_warnings(coverage))
          result(checks: checks, warnings: warnings, coverage: coverage, extension_id: extension&.id || extension_id)
        end

        private

        def smart_objects
          manager = @runtime.respond_to?(:smart_objects) ? @runtime.smart_objects : nil
          manager && manager.respond_to?(:all) ? Array(manager.all) : []
        end

        def fetch_object(object_id)
          manager = @runtime.respond_to?(:smart_objects) ? @runtime.smart_objects : nil
          return nil unless manager && manager.respond_to?(:fetch_by_id)

          manager.fetch_by_id(object_id.to_s)
        end

        def generated_from(objects, extension_id)
          Array(objects).select do |object|
            Array(object.respond_to?(:relationships) ? object.relationships : []).any? do |relationship|
              (relationship['kind'] || relationship[:kind]).to_s == 'generated_from' &&
                (relationship['target_id'] || relationship[:target_id]).to_s == extension_id.to_s
            end
          end
        end

        def coverage_for(objects, source: nil)
          values = Array(objects)
          values = [source, *values].compact if source
          owners = values.map { |object| object.respond_to?(:owner_module) ? object.owner_module.to_s : '' }
          types = values.map { |object| object.respond_to?(:type) ? object.type.to_s : '' }

          {
            'architecture' => owners.include?('constructflow.architecture'),
            'opening' => owners.include?('constructflow.opening'),
            'door_window' => owners.include?('constructflow.door_window'),
            'structure' => owners.include?('constructflow.structure'),
            'roof' => owners.include?('constructflow.roof'),
            'drainage' => owners.include?('constructflow.drainage'),
            'surface' => owners.include?('constructflow.surface'),
            'interior' => owners.include?('constructflow.interior'),
            'electrical' => owners.include?('constructflow.electrical'),
            'extension' => types.include?('extension.zone') || owners.include?('constructflow.extension')
          }.freeze
        end

        def coverage_warnings(coverage)
          recommended = %w[architecture structure roof drainage surface interior electrical]
          missing = recommended.reject { |key| coverage[key] }
          return [] if missing.empty?

          ["acceptance project does not yet cover recommended families: #{missing.join(', ')}"]
        end

        def collection_names(collection)
          return [] unless collection

          values = []
          collection.each do |item|
            name = item.respond_to?(:name) ? item.name : item.to_s
            value = name.to_s
            values << value unless value.empty?
          end
          values.uniq.sort
        end

        def check(id, passed, message, evidence = {})
          {
            'id' => id.to_s,
            'passed' => !!passed,
            'message' => message.to_s,
            'evidence' => stringify(evidence)
          }.freeze
        end

        def result(checks:, warnings:, coverage:, extension_id: nil)
          failed = checks.reject { |item| item['passed'] }.map { |item| item['id'] }
          {
            'ready' => failed.empty?,
            'extension_id' => extension_id.to_s,
            'failed_checks' => failed.freeze,
            'checks' => checks.freeze,
            'coverage' => coverage.freeze,
            'warnings' => warnings.map(&:to_s).freeze
          }.freeze
        end

        def stringify(value)
          value.each_with_object({}) { |(key, item), result| result[key.to_s] = item }
        end
      end
    end
  end
end
