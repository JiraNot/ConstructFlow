# ConstructFlow — SketchUp Host Boundary

## 1. Architectural Intent

ConstructFlow is fundamentally a **SketchUp-first** platform. However, coupling business logic, domain state validation, or quantity calculations directly to raw SketchUp C++/Ruby APIs makes unit testing fragile, introduces memory leaks, and complicates transaction rollbacks.

To balance native SketchUp high performance with clean software architecture, ConstructFlow establishes an explicit **Host Adapter Boundary**.

## 2. Boundary Layers

```text
┌────────────────────────────────────────────────────────┐
│           ConstructFlow Domain / Platform               │
│  (Definitions, Commands, Quantities, Rules, Schedules) │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│               Host Contracts / Adapters                │
│ ├── Core::Host::EntityAttributeAdapter                 │
│ ├── Core::Host::ModelTransactionAdapter                │
│ └── Core::Host::SketchUpHost                           │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│                  Native SketchUp Host                  │
│ ├── Sketchup::Model, Sketchup::Entities                │
│ ├── AttributeDictionaries                              │
│ ├── start_operation / commit_operation / abort         │
│ ├── Viewport Selection, Inference, Tools               │
│ └── Observers (App, Model, Entities)                   │
└────────────────────────────────────────────────────────┘
```

## 3. Host Adapters in Practice

### 3.1 Entity Attribute Adapter (`Core::Host::EntityAttributeAdapter`)
- Encapsulates dictionary read/write/delete operations on entities.
- Replaces raw calls to `entity.get_attribute` and `entity.set_attribute`.
- Supports graceful fallback when encountering non-SketchUp or stubbed objects during pure Ruby tests.
- Consumed by `Core::AttributeStore`.

```ruby
adapter = Core::Host::EntityAttributeAdapter.new(entity)
adapter.get_attribute('constructflow.core', 'object_id')
adapter.set_attribute('constructflow.core', 'status', 'active')
adapter.delete_attribute('constructflow.core', 'temporary_flag')
```

### 3.2 Model Transaction Adapter (`Core::Host::ModelTransactionAdapter`)
- Encapsulates `model.start_operation`, `model.commit_operation`, and `model.abort_operation`.
- Supports transparent undo operations (`transparent: true`) for intermediate micro-mutations.
- Ensures transactions always abort cleanly if exceptions occur inside command blocks.
- Consumed by `Core::TransactionManager`.

### 3.3 SketchUp Host Provider (`Core::Host::SketchUpHost`)
- Acts as the central host runtime gateway for `Runtime.host`.
- Manages active model references, observer registrations, and factory methods for entity and transaction adapters.

## 4. Preserving Native SketchUp First-Class UX

Decoupling through adapters does **not** degrade SketchUp UX:
- Native **Undo/Redo** is 100% preserved because all commands execute inside `start_operation`.
- Native **Selection and Inference** tools operate directly with SketchUp's input point mechanisms.
- Native **Scenes, Layers/Tags, and Section Cuts** remain authoritative for drawing views.
- Native **Attribute Dictionaries** remain the persistent backing store for Smart Objects.
