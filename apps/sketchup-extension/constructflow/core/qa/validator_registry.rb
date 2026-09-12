# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    module Core
      module QA
        class ValidationIssue
          SEVERITIES = %i[error warning info].freeze

          attr_reader :id, :domain, :object_id, :code, :message, :severity, :location_mm

          def initialize(id:, domain:, code:, message:, severity: :error, object_id: nil, location_mm: nil)
            @id = id.to_s.strip
            @domain = domain.to_s.strip.downcase
            @code = code.to_s.strip
            @message = message.to_s.strip
            @severity = severity.to_sym
            @object_id = object_id&.to_s
            @location_mm = location_mm ? Array(location_mm).map { |v| Float(v) }.freeze : nil
            raise ArgumentError, "invalid severity: #{@severity}" unless SEVERITIES.include?(@severity)
            freeze
          end

          def blocking?
            severity == :error
          end

          def to_h
            {
              'id' => id,
              'domain' => domain,
              'code' => code,
              'message' => message,
              'severity' => severity.to_s,
              'object_id' => object_id,
              'location_mm' => location_mm,
              'blocking' => blocking?
            }
          end
        end

        class ValidatorRegistry
          def initialize
            @validators = {}
          end

          def register(domain, validator = nil, &block)
            dom = domain.to_s.strip.downcase
            handler = validator || block
            raise ArgumentError, 'validator callable required' unless handler.respond_to?(:call)

            @validators[dom] ||= []
            @validators[dom] << handler
          end

          def validate_domain(domain, context = {})
            dom = domain.to_s.strip.downcase
            handlers = @validators[dom] || []
            issues = []
            handlers.each do |v|
              raw = v.call(context)
              issues.concat(normalize_issues(raw, dom))
            end
            issues
          end

          def validate_all(context = {})
            results = {}
            @validators.each_key do |dom|
              results[dom] = validate_domain(dom, context)
            end
            results
          end

          def all_issues(context = {})
            validate_all(context).values.flatten
          end

          def blocking_errors(context = {})
            all_issues(context).select(&:blocking?)
          end

          def summary(context = {})
            issues = all_issues(context)
            {
              total_issues: issues.length,
              errors: issues.count { |i| i.severity == :error },
              warnings: issues.count { |i| i.severity == :warning },
              infos: issues.count { |i| i.severity == :info },
              clean: issues.none?(&:blocking?)
            }
          end

          private

          def normalize_issues(raw, domain)
            Array(raw).map.with_index do |item, idx|
              if item.is_a?(ValidationIssue)
                item
              elsif item.is_a?(Hash)
                ValidationIssue.new(
                  id: item[:id] || item['id'] || "#{domain}_#{idx + 1}",
                  domain: item[:domain] || item['domain'] || domain,
                  code: item[:code] || item['code'] || 'validation_error',
                  message: item[:message] || item['message'] || 'Validation error',
                  severity: (item[:severity] || item['severity'] || :error).to_sym,
                  object_id: item[:object_id] || item['object_id'],
                  location_mm: item[:location_mm] || item['location_mm']
                )
              elsif item.is_a?(String)
                ValidationIssue.new(
                  id: "#{domain}_#{idx + 1}",
                  domain: domain,
                  code: 'generic_error',
                  message: item,
                  severity: :error
                )
              end
            end.compact
          end
        end
      end
    end
  end
end
