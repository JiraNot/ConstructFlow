# frozen_string_literal: true

# Architecture module registration.
# Split across registration/*.rb sibling files that reopen Registration;
# the public surface (install, editors, reconciliation helpers) is unchanged.

require_relative 'registration/shared_registration'
require_relative 'registration/wall_registration'
require_relative 'registration/floor_registration'
require_relative 'registration/room_registration'
require_relative 'registration/ceiling_registration'
