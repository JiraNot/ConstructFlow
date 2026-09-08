# frozen_string_literal: true

require 'minitest/autorun'

ROOT = File.expand_path('..', __dir__)
CORE = File.join(ROOT, 'apps', 'sketchup-extension', 'constructflow', 'core')

require File.join(CORE, 'id_generator')
require File.join(CORE, 'diagnostic_log')
require File.join(CORE, 'attribute_store')
require File.join(CORE, 'phase')
require File.join(CORE, 'project_store')
require File.join(CORE, 'level_registry')
require File.join(CORE, 'migration_registry')
require File.join(CORE, 'smart_object')
require File.join(CORE, 'smart_object_manager')
require File.join(CORE, 'transaction_manager')
require File.join(CORE, 'event_bus')
require File.join(CORE, 'command_bus')
require File.join(CORE, 'module_registry')
require File.join(CORE, 'module_loader')

class FakeAttributeCarrier
  def initialize
    @attributes = Hash.new { |hash, key| hash[key] = {} }
  end

  def get_attribute(dictionary, key, default = nil)
    @attributes[dictionary].fetch(key, default)
  end

  def set_attribute(dictionary, key, value)
    @attributes[dictionary][key] = value
    value
  end

  def delete_attribute(dictionary, key = nil)
    return @attributes.delete(dictionary) if key.nil?

    @attributes[dictionary].delete(key)
  end
end

class FakeEntity < FakeAttributeCarrier
  attr_reader :entities

  def initialize(children = [])
    super()
    @entities = children
  end
end

class FakeModel < FakeAttributeCarrier
  attr_reader :entities, :operations

  def initialize(entities = [])
    super()
    @entities = entities
    @operations = []
  end

  def start_operation(name, disable_ui = true, next_transparent = false, transparent = false)
    @operations << [:start, name, disable_ui, next_transparent, transparent]
    true
  end

  def commit_operation
    @operations << [:commit]
    true
  end

  def abort_operation
    @operations << [:abort]
    true
  end
end
