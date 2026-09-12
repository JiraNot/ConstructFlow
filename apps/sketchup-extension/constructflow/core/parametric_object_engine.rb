# frozen_string_literal: true

require 'strscan'

module JiraNot
  module ConstructFlow
    module Core
      class ParametricObjectEngine
        IDENTIFIER = /[A-Za-z_][A-Za-z0-9_]*/
        OPERATORS = {
          '+' => [1, :left], '-' => [1, :left], '*' => [2, :left], '/' => [2, :left]
        }.freeze

        def initialize(type_parameters: {}, formulas: {})
          @type_parameters = normalize_parameters(type_parameters)
          @formulas = normalize_formulas(formulas)
        end

        attr_reader :type_parameters, :formulas

        def resolve(instance_parameters: {})
          instance = normalize_parameters(instance_parameters)
          values = @type_parameters.merge(instance)
          evaluation_order(available_parameters: instance).each do |name|
            values[name] = evaluate(@formulas.fetch(name), values)
          end
          values.freeze
        end

        def validate
          evaluation_order
          resolve
          [].freeze
        rescue StandardError => error
          [error.message].freeze
        end

        private

        def normalize_parameters(value)
          (value || {}).each_with_object({}) do |(key, item), result|
            result[key.to_s] = Float(item)
          rescue TypeError, ArgumentError
            raise ArgumentError, "parameter #{key} must be numeric"
          end
        end

        def normalize_formulas(value)
          (value || {}).each_with_object({}) { |(key, expression), result| result[key.to_s] = expression.to_s }.freeze
        end

        def evaluation_order(available_parameters: {})
          dependencies = @formulas.each_with_object({}) do |(name, expression), result|
            result[name] = identifiers(expression).reject { |identifier| identifier == name }
          end
          unknown = dependencies.values.flatten.uniq.reject do |name|
            @formulas.key?(name) || @type_parameters.key?(name) || available_parameters.key?(name)
          end.sort.first
          raise ArgumentError, "unknown formula dependency: #{unknown}" if unknown

          visiting = {}
          visited = {}
          order = []
          visit = lambda do |name|
            return if visited[name]
            known_parameter = @type_parameters.key?(name) || available_parameters.key?(name)
            raise ArgumentError, "unknown formula dependency: #{name}" unless @formulas.key?(name) || known_parameter
            raise ArgumentError, "cyclic formula dependency: #{name}" if visiting[name]

            visiting[name] = true
            Array(dependencies[name]).each { |dependency| visit.call(dependency) }
            visiting.delete(name)
            visited[name] = true
            order << name if @formulas.key?(name)
          end
          @formulas.keys.each { |name| visit.call(name) }
          order.freeze
        end

        def identifiers(expression)
          expression.to_s.scan(IDENTIFIER).uniq
        end

        def evaluate(expression, values)
          output = []
          operators = []
          scanner = StringScanner.new(expression.to_s)
          expect_operand = true
          until scanner.eos?
            scanner.skip(/\s+/)
            if scanner.scan(/\d+(?:\.\d+)?/)
              output << scanner.matched.to_f
              expect_operand = false
            elsif scanner.scan(IDENTIFIER)
              name = scanner.matched
              raise ArgumentError, "unknown parameter: #{name}" unless values.key?(name)
              output << values.fetch(name)
              expect_operand = false
            elsif scanner.scan(/\(/)
              operators << '('
              expect_operand = true
            elsif scanner.scan(/\)/)
              raise ArgumentError, 'unbalanced formula parentheses' unless operators.include?('(')
              output << operators.pop until operators.last == '('
              operators.pop
              expect_operand = false
            elsif scanner.scan(/[+\-*\/]/)
              operator = scanner.matched
              raise ArgumentError, "formula cannot use unary operator: #{operator}" if expect_operand
              while operators.last && operators.last != '(' && OPERATORS.fetch(operators.last).first >= OPERATORS.fetch(operator).first
                output << operators.pop
              end
              operators << operator
              expect_operand = true
            else
              raise ArgumentError, "invalid formula near: #{scanner.peek(12)}"
            end
          end
          raise ArgumentError, 'formula ends with an operator' if expect_operand && !output.empty?
          output.concat(operators.reverse)
          evaluate_rpn(output)
        end

        def evaluate_rpn(tokens)
          stack = []
          tokens.each do |token|
            if token.is_a?(Numeric)
              stack << token
            else
              right = stack.pop
              left = stack.pop
              raise ArgumentError, 'invalid formula expression' if left.nil? || right.nil?
              raise ArgumentError, 'formula division by zero' if token == '/' && right.zero?

              stack << { '+' => left + right, '-' => left - right, '*' => left * right, '/' => left / right }.fetch(token)
            end
          end
          raise ArgumentError, 'invalid formula expression' unless stack.length == 1

          stack.first
        end
      end

      class ConstraintGraph
        def initialize
          @edges = Hash.new { |hash, key| hash[key] = [] }
        end

        def add(source:, target:, kind: 'dependency')
          source_id = source.to_s
          target_id = target.to_s
          raise ArgumentError, 'constraint source required' if source_id.empty?
          raise ArgumentError, 'constraint target required' if target_id.empty?

          @edges[source_id] << { target: target_id, kind: kind.to_s }
          self
        end

        def order
          visiting = {}
          visited = {}
          result = []
          visit = lambda do |node|
            return if visited[node]
            raise ArgumentError, "cyclic constraint dependency: #{node}" if visiting[node]

            visiting[node] = true
            Array(@edges[node]).each { |edge| visit.call(edge[:target]) }
            visiting.delete(node)
            visited[node] = true
            result << node
          end
          @edges.keys.sort.each { |node| visit.call(node) }
          result.reverse.freeze
        end

        def validate
          order
          [].freeze
        rescue StandardError => error
          [error.message].freeze
        end
      end
    end
  end
end
