# frozen_string_literal: true

require 'securerandom'

module JiraNot
  module ConstructFlow
    module Core
      class IdGenerator
        def generate(prefix)
          "#{prefix}_#{SecureRandom.uuid}"
        end

        def smart_object_id
          generate('cf')
        end

        def project_id
          generate('cf_project')
        end

        def command_id
          generate('cmd')
        end

        def event_id
          generate('evt')
        end

        def relationship_id
          generate('rel')
        end
      end
    end
  end
end
