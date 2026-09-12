# frozen_string_literal: true

require 'time'

module JiraNot
  module ConstructFlow
    module Core
      module QA
        class SiteVerificationDefinition
          STATES = %w[assumed surveyed verify_on_site as_built].freeze

          ALLOWED_TRANSITIONS = {
            'assumed' => %w[surveyed verify_on_site],
            'verify_on_site' => %w[surveyed],
            'surveyed' => %w[as_built verify_on_site],
            'as_built' => %w[verify_on_site]
          }.freeze

          attr_reader :object_id, :current_state, :history

          def initialize(object_id:, current_state: 'assumed', history: [])
            @object_id = object_id.to_s.strip
            @current_state = current_state.to_s.strip.downcase
            @history = Array(history).map { |h| normalize_history_item(h) }.freeze
            raise ArgumentError, "invalid state: #{@current_state}" unless STATES.include?(@current_state)
            freeze
          end

          def transition_to(target_state, user: 'site_engineer', notes: '')
            target = target_state.to_s.strip.downcase
            raise ArgumentError, "invalid target state: #{target}" unless STATES.include?(target)

            allowed = ALLOWED_TRANSITIONS[current_state] || []
            unless allowed.include?(target)
              raise ArgumentError, "disallowed transition from #{current_state} to #{target}"
            end

            entry = {
              'from' => current_state,
              'to' => target,
              'timestamp' => Time.now.iso8601,
              'user' => user.to_s.strip,
              'notes' => notes.to_s.strip
            }

            self.class.new(
              object_id: object_id,
              current_state: target,
              history: history + [entry]
            )
          end

          def hold_point?
            current_state == 'verify_on_site'
          end

          def confirmed?
            %w[surveyed as_built].include?(current_state)
          end

          def to_h
            {
              'object_id' => object_id,
              'current_state' => current_state,
              'hold_point' => hold_point?,
              'confirmed' => confirmed?,
              'history' => history
            }
          end

          def self.from_h(value)
            data = value || {}
            new(
              object_id: data['object_id'] || data[:object_id],
              current_state: data['current_state'] || data[:current_state] || 'assumed',
              history: data['history'] || data[:history] || []
            )
          end

          private

          def normalize_history_item(item)
            h = item || {}
            {
              'from' => (h['from'] || h[:from]).to_s,
              'to' => (h['to'] || h[:to]).to_s,
              'timestamp' => (h['timestamp'] || h[:timestamp] || Time.now.iso8601).to_s,
              'user' => (h['user'] || h[:user] || 'unknown').to_s,
              'notes' => (h['notes'] || h[:notes] || '').to_s
            }
          end
        end
      end
    end
  end
end
