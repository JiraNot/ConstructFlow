# frozen_string_literal: true

require 'fileutils'
require 'tmpdir'

module JiraNot
  module ConstructFlow
    module Core
      # Central helper for user-visible output paths.
      # Replaces scattered hardcoded fallbacks such as 'C:/Users/Dulla'.
      module Paths
        module_function

        # Best available directory for per-user output files (exports, saves).
        # Order: USERPROFILE -> HOME -> SketchUp temp dir -> system temp dir.
        def user_output_dir
          candidates = [
            ENV['USERPROFILE'],
            ENV['HOME'],
            defined?(Sketchup) && Sketchup.respond_to?(:temp_dir) ? Sketchup.temp_dir : nil,
            Dir.tmpdir
          ]
          dir = candidates.compact.map(&:to_s).find { |path| !path.strip.empty? }
          dir || '.'
        end

        def desktop_dir
          dir = File.join(user_output_dir, 'Desktop')
          File.directory?(dir) ? dir : user_output_dir
        end

        def ensure_dir!(path)
          FileUtils.mkdir_p(path) unless File.directory?(path)
          path
        end

        # Optional diagnostics sink for temporary debug logging.
        def debug_log_path
          File.join(ensure_dir!(temp_dir), 'constructflow_debug.log')
        end

        def temp_dir
          base = defined?(Sketchup) && Sketchup.respond_to?(:temp_dir) ? Sketchup.temp_dir : nil
          base = base.to_s.strip.empty? ? Dir.tmpdir : base.to_s
          ensure_dir!(File.join(base, 'ConstructFlow'))
        end
      end
    end
  end
end
