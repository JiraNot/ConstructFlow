# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      class LayoutTemplatePin
        attr_reader :scope_id, :use_case, :template_key, :version, :sha256

        def initialize(scope_id:, use_case:, template_key:, version:, sha256: '')
          @scope_id = required(scope_id, 'template pin scope_id')
          @use_case = required(use_case, 'template pin use_case')
          @template_key = required(template_key, 'template pin key')
          @version = required(version, 'template pin version')
          @sha256 = sha256.to_s.downcase
          raise ArgumentError, 'template pin sha256 must be 64 hex characters' unless @sha256.empty? || @sha256.match?(/\A[0-9a-f]{64}\z/)
          freeze
        end

        def to_h
          {
            'scope_id' => scope_id,
            'use_case' => use_case,
            'template_key' => template_key,
            'version' => version,
            'sha256' => sha256
          }.freeze
        end

        private

        def required(value, label)
          text = value.to_s
          raise ArgumentError, "#{label} required" if text.empty?
          text
        end
      end

      class LayoutTemplatePinStore
        def initialize
          @pins = {}
        end

        def pin(scope_id:, use_case:, template_key:, version:, sha256: '')
          pin = LayoutTemplatePin.new(
            scope_id: scope_id,
            use_case: use_case,
            template_key: template_key,
            version: version,
            sha256: sha256
          )
          @pins[identity(pin.scope_id, pin.use_case)] = pin
          pin
        end

        def fetch(scope_id:, use_case:)
          @pins[identity(scope_id, use_case)]
        end

        def fetch!(scope_id:, use_case:)
          fetch(scope_id: scope_id, use_case: use_case) || raise(KeyError, "no LayOut template pin for #{scope_id}/#{use_case}")
        end

        def unpin(scope_id:, use_case:)
          @pins.delete(identity(scope_id, use_case))
        end

        def all
          @pins.values.sort_by { |pin| [pin.scope_id, pin.use_case] }.freeze
        end

        private

        def identity(scope_id, use_case)
          "#{scope_id}:#{use_case}"
        end
      end
    end
  end
end
