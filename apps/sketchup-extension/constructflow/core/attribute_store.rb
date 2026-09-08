# frozen_string_literal: true

require 'json'

module JiraNot
  module ConstructFlow
    module Core
      class AttributeStore
        CORE_DICTIONARY = 'constructflow.core'
        LIBRARY_DICTIONARY = 'constructflow.library'

        def initialize(entity)
          @entity = entity
        end

        def read(key, default = nil, dictionary: CORE_DICTIONARY)
          @entity.get_attribute(dictionary, key.to_s, default)
        end

        def write(key, value, dictionary: CORE_DICTIONARY)
          @entity.set_attribute(dictionary, key.to_s, value)
        end

        def delete(key, dictionary: CORE_DICTIONARY)
          @entity.delete_attribute(dictionary, key.to_s)
        end

        def read_json(key, default = nil, dictionary: CORE_DICTIONARY)
          raw = read(key, nil, dictionary: dictionary)
          return default if raw.nil? || raw == ''

          JSON.parse(raw)
        rescue JSON::ParserError, TypeError
          default
        end

        def write_json(key, value, dictionary: CORE_DICTIONARY)
          write(key, JSON.generate(value), dictionary: dictionary)
        end

        def write_core_identity(id:, object_type:, owner_module:, schema_version: 1)
          write('object_id', id.to_s)
          write('object_type', object_type.to_s)
          write('owner_module', owner_module.to_s)
          write('schema_version', Integer(schema_version))
        end

        # Storage uses the accepted phase contract's `removed_phase` key.
        # SmartObject exposes it logically as phase.demolished.
        def write_lifecycle(created_phase:, removed_phase: nil)
          write('created_phase', created_phase.to_s)
          if removed_phase.nil?
            delete('removed_phase')
          else
            write('removed_phase', removed_phase.to_s)
          end
        end
      end
    end
  end
end
