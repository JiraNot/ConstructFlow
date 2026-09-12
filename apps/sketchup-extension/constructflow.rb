# frozen_string_literal: true

require 'sketchup.rb'
require 'extensions.rb'

module JiraNot
  module ConstructFlow
    EXTENSION_ID = 'constructflow'
    EXTENSION_NAME = 'ConstructFlow'
    VERSION = '0.14.0'

    unless file_loaded?(__FILE__)
      extension = SketchupExtension.new(EXTENSION_NAME, 'constructflow/bootstrap')
      extension.description = 'Modular design-to-construction platform for SketchUp.'
      extension.version = VERSION
      extension.creator = 'JiraNot'
      extension.copyright = 'Copyright JiraNot'

      Sketchup.register_extension(extension, true)
      file_loaded(__FILE__)
    end
  end
end
