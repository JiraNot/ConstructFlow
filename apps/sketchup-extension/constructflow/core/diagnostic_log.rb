# frozen_string_literal: true

require 'time'

module JiraNot
  module ConstructFlow
    module Core
      class DiagnosticLog
        Entry = Struct.new(:severity, :code, :message, :context, :timestamp, keyword_init: true)

        attr_reader :limit

        def initialize(limit: 200)
          @limit = Integer(limit)
          raise ArgumentError, 'limit must be positive' unless @limit.positive?

          @entries = []
        end

        def add(severity:, code:, message:, context: {})
          entry = Entry.new(
            severity: severity.to_s,
            code: code.to_s,
            message: message.to_s,
            context: context.dup.freeze,
            timestamp: Time.now.utc.iso8601
          ).freeze

          @entries << entry
          @entries.shift while @entries.length > @limit
          entry
        end

        def info(code, message, context = {})
          add(severity: :info, code: code, message: message, context: context)
        end

        def warn(code, message, context = {})
          add(severity: :warning, code: code, message: message, context: context)
        end

        def error(code, message, context = {})
          add(severity: :error, code: code, message: message, context: context)
        end

        def entries
          @entries.dup.freeze
        end

        def recent(count = 20)
          @entries.last(Integer(count)).dup.freeze
        end

        def clear
          @entries.clear
        end
      end
    end
  end
end
