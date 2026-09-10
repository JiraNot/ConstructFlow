# frozen_string_literal: true

module JiraNot
  module ConstructFlow
    # Executes an orchestration plan through injected domain handlers.
    # Handlers own geometry; the engine owns sequencing and lifecycle policy.
    class ExtensionExecutionEngine
      attr_reader :handlers

      def initialize(handlers: {}, transaction_manager: nil)
        @handlers = handlers.transform_keys(&:to_sym)
        @transaction_manager = transaction_manager
      end

      def execute(plan, dry_run: false)
        steps = Array(plan[:steps]).map { |step| symbolize(step) }
        results = []
        completed = {}
        fatal_errors = []

        runner = lambda do
          steps.each do |step|
            domain = step[:domain].to_sym
            dependencies = Array(step[:dependencies]).map(&:to_sym)

            unless dependencies.all? { |dependency| completed[dependency] == :success }
              results << Extension::ExecutionStepResult.new(
                domain: domain, status: :skipped, command_name: nil,
                created_object_ids: [], updated_object_ids: [], removed_object_ids: [],
                warnings: ['dependency not successful'], errors: []
              )
              next
            end

            if dry_run
              results << Extension::ExecutionStepResult.new(
                domain: domain, status: :pending,
                command_name: command_name_for(domain), created_object_ids: [],
                updated_object_ids: [], removed_object_ids: [], warnings: [], errors: []
              )
              completed[domain] = :success
              next
            end

            handler = @handlers[domain]
            unless handler
              error = "no handler registered for #{domain}"
              results << failed_result(domain, error)
              completed[domain] = :failed
              fatal_errors << error
              next
            end

            begin
              output = handler.call(step)
              result = normalize_output(domain, output)
              results << result
              completed[domain] = result.success? ? :success : :failed
            rescue StandardError => e
              result = failed_result(domain, e.message)
              results << result
              completed[domain] = :failed
              fatal_errors << e.message
            end
          end
        end

        if @transaction_manager && !dry_run
          @transaction_manager.with_operation('ConstructFlow: Generate Extension', disable_ui: true, &runner)
        else
          runner.call
        end

        status = if results.empty? || results.all?(&:success?) || results.all? { |result| result.status.to_sym == :pending }
                   dry_run ? :preview : :success
                 elsif results.any?(&:success?)
                   :partial
                 else
                   :failed
                 end

        Extension::ExecutionResult.new(
          extension_id: plan[:extension_id], status: status, steps: results, errors: fatal_errors
        )
      end

      private

      def command_name_for(domain)
        "GenerateOrUpdate#{domain.to_s.split('_').map(&:capitalize).join}FromExtension"
      end

      def normalize_output(domain, output)
        data = output.is_a?(Hash) ? symbolize(output) : {}
        Extension::ExecutionStepResult.new(
          domain: domain,
          status: (data[:status] || :success).to_sym,
          command_name: data[:command_name] || command_name_for(domain),
          created_object_ids: data[:created_object_ids] || [],
          updated_object_ids: data[:updated_object_ids] || [],
          removed_object_ids: data[:removed_object_ids] || [],
          warnings: data[:warnings] || [],
          errors: data[:errors] || []
        )
      end

      def failed_result(domain, message)
        Extension::ExecutionStepResult.new(
          domain: domain, status: :failed, command_name: command_name_for(domain),
          created_object_ids: [], updated_object_ids: [], removed_object_ids: [],
          warnings: [], errors: [message]
        )
      end

      def symbolize(value)
        return value unless value.is_a?(Hash)

        value.each_with_object({}) { |(key, item), result| result[key.to_sym] = symbolize(item) }
      end
    end
  end
end
