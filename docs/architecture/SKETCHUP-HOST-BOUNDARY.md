# ConstructFlow — SketchUp Host Boundary

## 1. Architectural Intent

ConstructFlow is a standalone-first platform under ADR-0006. This document defines only the optional SketchUp adapter's Ruby host boundary. The canonical `.cfproj` project and standalone domain runtime own product semantics; SketchUp APIs must remain isolated from those contracts.

The SketchUp integration uses an explicit **Host Adapter Boundary** for native entity attributes, operations and interaction. Adapter storage and rendering do not replace the standalone SSOT.

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

## 4. Optional Adapter Interaction and Persistence

Adapter acceptance must verify:
- native Undo/Redo through SketchUp operations for adapter mutations;
- selection and inference through SketchUp input point mechanisms;
- scenes, tags and section cuts as downstream representations of canonical drawing intent;
- attribute dictionaries as adapter-local metadata preserving Smart Object identity;
- UUID matching, customization preservation and explicit reconciliation through command contracts.

These native capabilities have independent acceptance evidence and do not gate standalone project editing, persistence or output compilation.
