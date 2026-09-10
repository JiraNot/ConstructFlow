# frozen_string_literal: true

require 'digest'

module JiraNot
  module ConstructFlow
    module Core
      class LayoutTemplateAssetVerifier
        def initialize(exists: nil, digest: nil)
          @exists = exists || ->(path) { File.file?(path.to_s) }
          @digest = digest || ->(path) { Digest::SHA256.file(path.to_s).hexdigest }
        end

        def verify!(definition, expected_sha256: '')
          path = definition.path.to_s
          raise IOError, "LayOut template asset not found: #{path}" unless @exists.call(path)

          expected = expected_sha256.to_s.downcase
          actual = @digest.call(path).to_s.downcase
          if !expected.empty? && actual != expected
            raise IOError, "LayOut template asset hash mismatch: #{definition.key}@#{definition.version}"
          end

          {
            'verified' => true,
            'path' => path,
            'sha256' => actual,
            'key' => definition.key,
            'version' => definition.version
          }.freeze
        end
      end
    end
  end
end
