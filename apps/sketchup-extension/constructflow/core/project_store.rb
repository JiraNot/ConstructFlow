# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class ProjectStore
        PROJECT_SCHEMA_VERSION = 1
        DEFAULT_UNITS = 'mm'

        def initialize(model, id_generator: IdGenerator.new)
          @store = AttributeStore.new(model)
          @id_generator = id_generator
        end

        def ensure_project!(name: 'Untitled Project', code: nil)
          return project_id if project_id

          @store.write('project_schema_version', PROJECT_SCHEMA_VERSION)
          @store.write('project_id', @id_generator.project_id)
          @store.write('project_name', name.to_s)
          @store.write('project_code', code.to_s) unless code.nil?
          @store.write('project_units', DEFAULT_UNITS)
          @store.write('working_phase', Phase::NEW_CONSTRUCTION)
          @store.write_json('levels', [])
          project_id
        end

        def project_id
          @store.read('project_id')
        end

        def update_metadata!(name:, code: nil)
          raise ArgumentError, 'project name required' if name.to_s.strip.empty?

          @store.write('project_name', name.to_s.strip)
          @store.write('project_code', code.to_s.strip)
          to_h
        end

        def project_name
          @store.read('project_name', 'Untitled Project')
        end

        def project_code
          @store.read('project_code')
        end

        def units
          @store.read('project_units', DEFAULT_UNITS)
        end

        def working_phase
          @store.read('working_phase', Phase::NEW_CONSTRUCTION)
        end

        def working_phase=(phase)
          raise ArgumentError, "invalid phase: #{phase}" unless Phase.valid?(phase)

          @store.write('working_phase', phase.to_s)
        end

        def levels
          @store.read_json('levels', []) || []
        end

        def levels=(records)
          @store.write_json('levels', Array(records))
        end

        def schema_version
          Integer(@store.read('project_schema_version', PROJECT_SCHEMA_VERSION))
        end

        def to_h
          {
            id: project_id,
            name: project_name,
            code: project_code,
            units: units,
            working_phase: working_phase,
            schema_version: schema_version,
            levels: levels
          }
        end
      end
    end
  end
end
